"""Physics-based flight duration estimator.

No API call. Computes great-circle distance via haversine, then converts to a
duration using a fixed cruise speed plus a flat overhead for boarding,
taxi, and security. The orchestrator marks these options `is_estimate=True`
so the UI shows an explicit "estimate" chip — we are not pretending to know
real flight schedules.

Returns None when great-circle distance is below `MIN_FLIGHT_KM`; below that
threshold flying makes no sense and a wrong cheap estimate would be worse
than no option at all.
"""
from __future__ import annotations

from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_METERS = 6_371_000.0
CRUISE_SPEED_KMH = 800.0
TURNAROUND_OVERHEAD_SECONDS = 2 * 60 * 60  # 2h: check-in, security, taxi, baggage
MIN_FLIGHT_KM = 200.0


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    """Great-circle distance in meters between two lat/lng points."""
    phi1 = radians(lat1)
    phi2 = radians(lat2)
    dphi = radians(lat2 - lat1)
    dlmb = radians(lng2 - lng1)
    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlmb / 2) ** 2
    return int(round(2 * EARTH_RADIUS_METERS * asin(sqrt(a))))


def estimate_flight(
    src_lat: float,
    src_lng: float,
    dst_lat: float,
    dst_lng: float,
) -> dict | None:
    """Return a flight option dict, or None when the pair is too short to fly.

    Output shape matches `TransportOption` (mode, name, duration_seconds,
    distance_meters, is_estimate, geometry). Geometry is omitted — projecting
    a great-circle on a flat map looks misleading on the typical web Mercator,
    and a straight line would suggest precision the estimate doesn't have.
    """
    distance_meters = haversine_meters(src_lat, src_lng, dst_lat, dst_lng)
    distance_km = distance_meters / 1000.0
    if distance_km < MIN_FLIGHT_KM:
        return None

    cruise_seconds = (distance_km / CRUISE_SPEED_KMH) * 3600.0
    duration_seconds = int(round(cruise_seconds + TURNAROUND_OVERHEAD_SECONDS))

    return {
        "mode": "flight",
        "name": "Flight",
        "duration_seconds": duration_seconds,
        "distance_meters": distance_meters,
        "is_estimate": True,
        "geometry": None,
    }
