"""Backend OSRM client (FOSSGIS public instance) — frontend never talks to FOSSGIS directly because that path is fragile from many client networks (DNS pinning, hosts-file workarounds, browser DNS cache)."""
from __future__ import annotations

import asyncio
import logging
from typing import Literal

import httpx
from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger(__name__)


OsrmProfile = Literal["foot", "bike", "driving"]

OSRM_BASE_URL = "https://routing.openstreetmap.de"

OSRM_HOST_PREFIX_BY_PROFILE: dict[OsrmProfile, str] = {
    "foot": "routed-foot",
    "bike": "routed-bike",
    "driving": "routed-car",
}

REQUEST_TIMEOUT_SECONDS = 12.0
RETRY_BACKOFF_SECONDS = 0.6


class OsrmRouteResult(BaseModel):
    distance_meters: int
    duration_seconds: int
    geometry: list[list[float]]


OsrmDrivingResult = OsrmRouteResult


client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient:
    """FOSSGIS requires a descriptive User-Agent — reuses GEOCODER_USER_AGENT to share operational identity with Nominatim and Transitous."""
    global client
    if client is None:
        client = httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT_SECONDS,
            headers={"User-Agent": settings.GEOCODER_USER_AGENT},
        )
    return client


async def close_osrm_client() -> None:
    """Idempotent."""
    global client
    if client is not None:
        await client.aclose()
        client = None


async def fetch_route_once(
    profile: OsrmProfile,
    src_lat: float,
    src_lng: float,
    dst_lat: float,
    dst_lng: float,
) -> OsrmRouteResult | None:
    host_prefix = OSRM_HOST_PREFIX_BY_PROFILE[profile]
    coords = f"{src_lng},{src_lat};{dst_lng},{dst_lat}"
    params = {"overview": "full", "geometries": "geojson"}
    url = f"{OSRM_BASE_URL}/{host_prefix}/route/v1/{profile}/{coords}"

    try:
        response = await get_client().get(url, params=params)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("OSRM %s fetch failed: %s", profile, exc)
        return None

    payload = response.json()
    if payload.get("code") != "Ok":
        return None
    routes = payload.get("routes") or []
    if not routes:
        return None
    route = routes[0]
    geometry = (route.get("geometry") or {}).get("coordinates")
    if not geometry or len(geometry) < 2:
        return None
    distance = route.get("distance")
    duration = route.get("duration")
    if not isinstance(distance, (int, float)) or not isinstance(duration, (int, float)):
        return None

    return OsrmRouteResult(
        distance_meters=int(round(distance)),
        duration_seconds=int(round(duration)),
        geometry=geometry,
    )


async def get_route(
    profile: OsrmProfile,
    src_lat: float,
    src_lng: float,
    dst_lat: float,
    dst_lng: float,
) -> OsrmRouteResult | None:
    """One short retry on transient failure."""
    first = await fetch_route_once(profile, src_lat, src_lng, dst_lat, dst_lng)
    if first is not None:
        return first
    await asyncio.sleep(RETRY_BACKOFF_SECONDS)
    return await fetch_route_once(profile, src_lat, src_lng, dst_lat, dst_lng)


async def get_driving_route(
    src_lat: float,
    src_lng: float,
    dst_lat: float,
    dst_lng: float,
) -> OsrmRouteResult | None:
    return await get_route("driving", src_lat, src_lng, dst_lat, dst_lng)
