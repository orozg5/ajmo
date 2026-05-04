"""Key-free geocoding + timezone resolution.

Primary: Photon (https://photon.komoot.io) — no key, no hard rate limit.
Fallback: Nominatim (https://nominatim.openstreetmap.org) — 1 req/s cap.

LLM-returned coordinates are never trusted; this module is the only writer
of `places.lat`, `places.lng`, and `places.timezone`.
"""
from __future__ import annotations

import logging
from typing import Literal

import httpx
from pydantic import BaseModel
from timezonefinder import TimezoneFinder

from app.config import settings
from app.services.places.country_codes import coord_in_country_bbox

logger = logging.getLogger(__name__)


PHOTON_URL = "https://photon.komoot.io/api"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
REQUEST_TIMEOUT_SECONDS = 5.0


class GeocodeResult(BaseModel):
    lat: float
    lng: float
    source: Literal["photon", "nominatim"]


client: httpx.AsyncClient | None = None

tz_finder = TimezoneFinder(in_memory=True)


def get_client() -> httpx.AsyncClient:
    """Lazy-init shared async HTTP client with a descriptive User-Agent."""
    global client
    if client is None:
        client = httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT_SECONDS,
            headers={"User-Agent": settings.GEOCODER_USER_AGENT},
        )
    return client


async def close_geocoder_client() -> None:
    """Shut down the shared HTTP client. Idempotent."""
    global client
    if client is not None:
        await client.aclose()
        client = None


def photon_pick_best(
    features: list[dict],
    country_code: str | None,
    destination_tokens: list[str],
) -> dict | None:
    """Pick the best Photon candidate given optional country + destination hints.

    Photon has no countrycodes filter, so we post-filter: prefer a candidate
    whose properties.country matches country_code, else one whose city/name
    contains any destination token (case-insensitive), else the first.
    """
    if not features:
        return None

    if country_code:
        for feature in features:
            props = feature.get("properties") or {}
            country_property = (props.get("country") or "").lower()
            country_code_prop = (props.get("countrycode") or "").lower()
            if country_code_prop == country_code or country_code in country_property:
                return feature

    if destination_tokens:
        for feature in features:
            props = feature.get("properties") or {}
            haystack = " ".join(
                str(props.get(key) or "")
                for key in ("city", "county", "state", "name")
            ).lower()
            if any(token in haystack for token in destination_tokens):
                return feature

    return features[0]


async def photon_lookup(
    query: str,
    *,
    country_code: str | None = None,
    bbox: tuple[float, float, float, float] | None = None,
    destination_tokens: list[str] | None = None,
) -> GeocodeResult | None:
    params: dict[str, str | int] = {"q": query, "limit": 5}
    if bbox:
        params["bbox"] = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"
    try:
        response = await get_client().get(PHOTON_URL, params=params)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Photon geocode failed for %r: %s", query, exc)
        return None

    payload = response.json()
    features = payload.get("features") or []
    best = photon_pick_best(features, country_code, destination_tokens or [])
    if best is None:
        return None

    coords = best.get("geometry", {}).get("coordinates")
    if not coords or len(coords) < 2:
        return None

    lng, lat = float(coords[0]), float(coords[1])
    return GeocodeResult(lat=lat, lng=lng, source="photon")


async def nominatim_lookup(
    query: str,
    *,
    country_code: str | None = None,
    bbox: tuple[float, float, float, float] | None = None,
    destination_tokens: list[str] | None = None,
) -> GeocodeResult | None:
    del destination_tokens  # Nominatim handles biasing server-side via countrycodes/viewbox.
    params: dict[str, str | int] = {
        "q": query,
        "format": "json",
        "limit": 5,
        "addressdetails": 1,
    }
    if country_code:
        params["countrycodes"] = country_code.lower()
    if bbox:
        params["viewbox"] = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"
        params["bounded"] = 1
    try:
        response = await get_client().get(NOMINATIM_URL, params=params)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Nominatim geocode failed for %r: %s", query, exc)
        return None

    results = response.json() or []
    if not results:
        return None

    first = results[0]
    try:
        return GeocodeResult(
            lat=float(first["lat"]),
            lng=float(first["lon"]),
            source="nominatim",
        )
    except (KeyError, ValueError) as exc:
        logger.warning("Nominatim payload malformed for %r: %s", query, exc)
        return None


PROVIDERS = {
    "photon": photon_lookup,
    "nominatim": nominatim_lookup,
}


async def geocode(
    query: str,
    *,
    country_code: str | None = None,
    bbox: tuple[float, float, float, float] | None = None,
    destination_tokens: list[str] | None = None,
) -> GeocodeResult | None:
    """Resolve a free-text address to lat/lng via Photon then Nominatim.

    `country_code` + `bbox` bias the result; `destination_tokens` help Photon
    post-filter (it has no server-side countrycodes param).

    Returns None on total failure. Callers must treat None as non-fatal and
    persist the place row without coordinates.
    """
    if not query or not query.strip():
        return None

    primary_fn = PROVIDERS.get(settings.GEOCODER_PRIMARY)
    if primary_fn is None:
        logger.error("Unknown GEOCODER_PRIMARY=%r", settings.GEOCODER_PRIMARY)
        return None

    result = await primary_fn(
        query,
        country_code=country_code,
        bbox=bbox,
        destination_tokens=destination_tokens,
    )
    if result is not None:
        return result

    fallback_name = settings.GEOCODER_FALLBACK
    if not fallback_name or fallback_name == settings.GEOCODER_PRIMARY:
        return None

    fallback_fn = PROVIDERS.get(fallback_name)
    if fallback_fn is None:
        logger.error("Unknown GEOCODER_FALLBACK=%r", fallback_name)
        return None

    return await fallback_fn(
        query,
        country_code=country_code,
        bbox=bbox,
        destination_tokens=destination_tokens,
    )


async def geocode_with_validation(
    query: str,
    *,
    country_code: str | None = None,
    destination_tokens: list[str] | None = None,
) -> GeocodeResult | None:
    """Geocode + drop coordinates that fall outside the country bbox.

    Prefer this over bare `geocode()` when you have a country hint — a wrong
    pin is worse than a missing one (users can spot a missing pin, not a
    subtly-off one).
    """
    result = await geocode(
        query,
        country_code=country_code,
        destination_tokens=destination_tokens,
    )
    if result is None:
        return None
    if country_code and not coord_in_country_bbox(result.lat, result.lng, country_code):
        logger.warning(
            "Geocoded %r to (%.4f, %.4f) outside %s bbox, discarding",
            query, result.lat, result.lng, country_code,
        )
        return None
    return result


def resolve_timezone(lat: float, lng: float) -> str | None:
    """IANA timezone name for a coordinate. Offline, millisecond lookup."""
    try:
        return tz_finder.timezone_at(lat=lat, lng=lng)
    except Exception as exc:
        logger.warning("timezonefinder lookup failed for (%s, %s): %s", lat, lng, exc)
        return None
