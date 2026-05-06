"""Public-transit routing via Transitous (MOTIS-backed, free, no API key).

Endpoint: https://api.transitous.org/api/v5/plan

Transitous is a community-run, free, non-commercial public-transit routing
service backed by the open-source MOTIS engine. It aggregates open GTFS feeds
worldwide — no registration, no API key, no credit card. The service requires
every request to carry a descriptive `User-Agent` with contact info; we reuse
`GEOCODER_USER_AGENT` for that since both Nominatim and Transitous expect the
same operational identity.

Returns None when no public-transit itinerary exists between the two points
so the frontend can hide the Transit button. Walk-only itineraries (which
MOTIS sometimes returns when the points are close) are deliberately filtered
out — the frontend already has a separate Walk button via OSRM.
"""
from __future__ import annotations

import logging

import httpx
from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger(__name__)


TRANSITOUS_PLAN_URL = "https://api.transitous.org/api/v5/plan"
REQUEST_TIMEOUT_SECONDS = 12.0
MAX_ITINERARIES = 5


class TransitDirectionsResult(BaseModel):
    distance_meters: int
    duration_seconds: int
    transit_summary: str
    geometry: list[list[float]]


client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient:
    """Lazy-init shared async HTTP client."""
    global client
    if client is None:
        client = httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT_SECONDS,
            headers={"User-Agent": settings.GEOCODER_USER_AGENT},
        )
    return client


async def close_transit_client() -> None:
    """Shut down the shared HTTP client. Idempotent."""
    global client
    if client is not None:
        await client.aclose()
        client = None


def decode_polyline(encoded: str, precision: int = 6) -> list[list[float]]:
    """Decode a polyline-encoded string to GeoJSON-style [lng, lat] pairs.

    Standard Google polyline algorithm:
    https://developers.google.com/maps/documentation/utilities/polylinealgorithm

    `precision` is the number of decimal digits the encoder used (5 = Google
    standard 1e5; 6 = MOTIS v2+ default 1e6). Pass the value MOTIS reports in
    `legGeometry.precision`.
    """
    factor = 10 ** precision
    coords: list[list[float]] = []
    index = 0
    lat = 0
    lng = 0
    length = len(encoded)

    while index < length:
        shift = 0
        result = 0
        while True:
            byte = ord(encoded[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        delta_lat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += delta_lat

        shift = 0
        result = 0
        while True:
            byte = ord(encoded[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        delta_lng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += delta_lng

        coords.append([lng / factor, lat / factor])

    return coords


VEHICLE_LABEL_BY_MODE: dict[str, str] = {
    "TRAM": "Tram",
    "SUBWAY": "Metro",
    "METRO": "Metro",
    "RAIL": "Train",
    "REGIONAL_RAIL": "Train",
    "LONG_DISTANCE": "Train",
    "HIGH_SPEED_RAIL": "Train",
    "MONORAIL": "Monorail",
    "BUS": "Bus",
    "TROLLEYBUS": "Trolley",
    "FERRY": "Ferry",
    "FUNICULAR": "Funicular",
    "AERIAL_LIFT": "Cable car",
    "CABLE_CAR": "Cable car",
    "COACH": "Coach",
}


def summarize_legs(legs: list[dict]) -> str:
    """Build a short readable label like "Tram 4 + Bus 232 + walk".

    Walks within the journey are collapsed into a single "+ walk" suffix.
    Caps at three transit names to keep the badge short.
    """
    transit_names: list[str] = []
    seen: set[str] = set()
    has_walk = False

    for leg in legs:
        mode = (leg.get("mode") or "").upper()
        if mode == "WALK":
            has_walk = True
            continue
        vehicle_label = VEHICLE_LABEL_BY_MODE.get(mode, "Transit")
        short = leg.get("routeShortName") or leg.get("routeLongName") or ""
        label = f"{vehicle_label} {short}".strip()
        if label and label not in seen:
            seen.add(label)
            transit_names.append(label)

    capped = transit_names[:3]
    if not capped:
        return "Walk"
    summary = " + ".join(capped)
    if has_walk:
        summary += " + walk"
    return summary


def has_transit_leg(itinerary: dict) -> bool:
    """True if the itinerary contains at least one non-walk leg."""
    for leg in itinerary.get("legs") or []:
        mode = (leg.get("mode") or "").upper()
        if mode and mode != "WALK":
            return True
    return False


def haversine_distance(coords: list[list[float]]) -> int:
    """Sum of great-circle distances along a [[lng, lat], ...] path, in meters.

    Used to fill in `distance_meters` because MOTIS reports `null` distance on
    transit legs (only walk legs include it). Polyline-derived distance is a
    close approximation of actual track distance for transit.
    """
    from math import asin, cos, radians, sin, sqrt

    if len(coords) < 2:
        return 0
    earth_r = 6_371_000.0
    total = 0.0
    for i in range(1, len(coords)):
        lng1, lat1 = coords[i - 1]
        lng2, lat2 = coords[i]
        phi1 = radians(lat1)
        phi2 = radians(lat2)
        dphi = radians(lat2 - lat1)
        dlmb = radians(lng2 - lng1)
        a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlmb / 2) ** 2
        total += 2 * earth_r * asin(sqrt(a))
    return int(round(total))


async def get_transit_directions(
    src_lat: float,
    src_lng: float,
    dst_lat: float,
    dst_lng: float,
    transit_modes: list[str] | None = None,
    num_itineraries: int = MAX_ITINERARIES,
) -> TransitDirectionsResult | None:
    """Plan a public-transit itinerary between two points via Transitous.

    Picks the first itinerary containing at least one transit leg; ignores
    walk-only itineraries. Returns None when no transit option exists or when
    Transitous returns an empty / malformed response — the frontend hides the
    Transit button in that case.

    When `transit_modes` is set, restricts the search to those MOTIS mode
    enums (e.g. `["RAIL", "HIGH_SPEED_RAIL"]` for trains-only, `["BUS",
    "COACH"]` for buses, `["FERRY"]` for ferries). The cross-city orchestrator
    uses this to fan out one call per mode and present them as separate options.

    `num_itineraries` controls how many MOTIS itineraries we ask for. The
    same-day path defaults to MAX_ITINERARIES because itineraries can be
    walk-only and we want a non-walk fallback; mode-filtered cross-city calls
    pass 1 because the filter already constrains to a transit mode.
    """
    params: dict[str, str | int] = {
        "fromPlace": f"{src_lat},{src_lng}",
        "toPlace": f"{dst_lat},{dst_lng}",
        "numItineraries": num_itineraries,
    }
    if transit_modes:
        params["transitModes"] = ",".join(transit_modes)

    try:
        response = await get_client().get(TRANSITOUS_PLAN_URL, params=params)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Transitous transit fetch failed: %s", exc)
        return None

    payload = response.json()
    itineraries = payload.get("itineraries") or []
    if not itineraries:
        return None

    chosen = next((it for it in itineraries if has_transit_leg(it)), None)
    if chosen is None:
        return None

    duration = chosen.get("duration")
    legs = chosen.get("legs") or []
    if not isinstance(duration, int) or not legs:
        return None

    coords: list[list[float]] = []
    for leg in legs:
        leg_geometry = leg.get("legGeometry") or {}
        encoded = leg_geometry.get("points") or ""
        precision_value = leg_geometry.get("precision")
        precision = precision_value if isinstance(precision_value, int) else 6
        if not encoded:
            continue
        leg_coords = decode_polyline(encoded, precision=precision)
        if not leg_coords:
            continue
        # Avoid duplicating the seam point between adjacent legs.
        if coords and leg_coords[0] == coords[-1]:
            coords.extend(leg_coords[1:])
        else:
            coords.extend(leg_coords)

    if len(coords) < 2:
        return None

    distance_meters = haversine_distance(coords)
    summary = summarize_legs(legs)

    return TransitDirectionsResult(
        distance_meters=distance_meters,
        duration_seconds=duration,
        transit_summary=summary,
        geometry=coords,
    )
