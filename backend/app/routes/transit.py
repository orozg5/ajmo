import logging

from fastapi import APIRouter, Depends, HTTPException, Response

from app.auth import get_current_user
from app.schemas.transit import (
    OsrmRouteRequest,
    OsrmRouteResponse,
    TransitDirectionsRequest,
    TransitDirectionsResponse,
)
from app.services.transit.directions import get_transit_directions
from app.services.transport.osrm import get_route as get_osrm_route

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transit", tags=["transit"])


@router.post("/directions")
async def transit_directions_route(
    body: TransitDirectionsRequest,
    response: Response,
    current_user: str = Depends(get_current_user),
) -> TransitDirectionsResponse | None:
    """Resolve a public-transit route between two coordinates via Google Directions.

    Returns 204 No Content when no public-transit option exists between the
    two points (Google ZERO_RESULTS) — the frontend hides the Transit button
    in that case. Successful responses return distance, duration, a short
    human-readable summary (e.g. "Tram 1 + walk"), and decoded polyline
    geometry as [[lng, lat], ...] for direct MapLibre consumption.
    """
    try:
        result = await get_transit_directions(
            body.src_lat, body.src_lng, body.dst_lat, body.dst_lng,
        )
    except Exception:
        logger.exception("Unexpected error in transit directions lookup")
        raise HTTPException(status_code=500, detail="Transit directions failed")

    if result is None:
        response.status_code = 204
        return None
    return TransitDirectionsResponse(**result.model_dump())


@router.post("/osrm-route")
async def transit_osrm_route_route(
    body: OsrmRouteRequest,
    response: Response,
    current_user: str = Depends(get_current_user),
) -> OsrmRouteResponse | None:
    """Resolve a same-day route between two coordinates via FOSSGIS OSRM.

    Proxies the public OSRM instance server-side so the frontend doesn't have
    to manage DNS, browser CORS quirks, hosts-file workarounds, or the FOSSGIS
    1-req/sec/host rate limit directly. Returns 204 No Content when OSRM has
    no route (extremely rare for in-city pairs) — the frontend hides that
    mode's button.
    """
    try:
        result = await get_osrm_route(
            body.profile, body.src_lat, body.src_lng, body.dst_lat, body.dst_lng,
        )
    except Exception:
        logger.exception("Unexpected error in OSRM route lookup")
        raise HTTPException(status_code=500, detail="OSRM route lookup failed")

    if result is None:
        response.status_code = 204
        return None
    return OsrmRouteResponse(**result.model_dump())
