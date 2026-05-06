"""Key-free geocoding + timezone resolution.

Geocoder: Nominatim (https://nominatim.openstreetmap.org) — 1 req/s cap
enforced by the module-level `nominatim_limiter`. Both runtime enrichment
and the backfill script funnel through the same limiter.

LLM-returned coordinates are never trusted; this module is the only writer
of `places.lat`, `places.lng`, and `places.timezone`.
"""
from __future__ import annotations

import logging

import httpx
from aiolimiter import AsyncLimiter
from pydantic import BaseModel
from timezonefinder import TimezoneFinder

from app.config import settings
from app.services.places.country_codes import coord_in_country_bbox

logger = logging.getLogger(__name__)


NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
REQUEST_TIMEOUT_SECONDS = 5.0
nominatim_limiter = AsyncLimiter(1, 1)


class GeocodeResult(BaseModel):
    lat: float
    lng: float


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


async def geocode(
    query: str,
    *,
    country_code: str | None = None,
    bbox: tuple[float, float, float, float] | None = None,
) -> GeocodeResult | None:
    """Resolve a free-text address to lat/lng via Nominatim.

    `country_code` and `bbox` bias the result server-side.

    Returns None on total failure. Callers must treat None as non-fatal and
    persist the place row without coordinates.
    """
    if not query or not query.strip():
        return None

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
        async with nominatim_limiter:
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
        return GeocodeResult(lat=float(first["lat"]), lng=float(first["lon"]))
    except (KeyError, ValueError) as exc:
        logger.warning("Nominatim payload malformed for %r: %s", query, exc)
        return None


async def geocode_with_validation(
    query: str,
    *,
    country_code: str | None = None,
) -> GeocodeResult | None:
    """Geocode + drop coordinates that fall outside the country bbox.

    Prefer this over bare `geocode()` when you have a country hint — a wrong
    pin is worse than a missing one (users can spot a missing pin, not a
    subtly-off one).
    """
    result = await geocode(query, country_code=country_code)
    if result is None:
        return None
    if country_code and not coord_in_country_bbox(result.lat, result.lng, country_code):
        logger.warning(
            "Geocoded %r to (%.4f, %.4f) outside %s bbox, discarding",
            query, result.lat, result.lng, country_code,
        )
        return None
    return result


async def geocode_with_fallbacks(
    name: str,
    destination: str,
    *,
    country_code: str | None = None,
    location_query: str | None = None,
) -> GeocodeResult | None:
    """Try multiple Nominatim queries — first match wins.

    Order:
      1. `"{location_query}, {destination}"` if `location_query` is given
         (typically the LLM-extracted street address — most precise).
      2. `"{name}, {destination}"` (canonical place name + city).
      3. `name` alone (last resort; bbox validation still applies).

    Each variant goes through `geocode_with_validation` so an out-of-country
    pin is discarded rather than returned. Returns None only if every variant
    misses or every result fails the bbox guard.
    """
    location_for_variant = location_query.strip() if location_query else None
    if location_for_variant and destination:
        if location_for_variant.lower().endswith(destination.lower()):
            location_for_variant = location_for_variant[: -len(destination)].rstrip(", ").strip() or None

    seen: set[str] = set()
    variants: list[str] = []
    for candidate in (
        f"{location_for_variant}, {destination}" if location_for_variant and destination else location_for_variant,
        f"{name.strip()}, {destination}" if name and name.strip() and destination else None,
        name.strip() if name and name.strip() else None,
    ):
        if candidate and candidate.lower() not in seen:
            seen.add(candidate.lower())
            variants.append(candidate)

    for query in variants:
        result = await geocode_with_validation(query, country_code=country_code)
        if result is not None:
            return result
    return None


def resolve_timezone(lat: float, lng: float) -> str | None:
    """IANA timezone name for a coordinate. Offline, millisecond lookup."""
    try:
        return tz_finder.timezone_at(lat=lat, lng=lng)
    except Exception as exc:
        logger.warning("timezonefinder lookup failed for (%s, %s): %s", lat, lng, exc)
        return None
