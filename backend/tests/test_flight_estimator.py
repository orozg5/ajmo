"""Unit tests for the haversine flight estimator.

Pure function — no API, no mocks needed. Verifies the distance gate, the
cruise-speed model, and the boarding-overhead constant.
"""
from app.services.transport.flight_estimator import (
    MIN_FLIGHT_KM,
    TURNAROUND_OVERHEAD_SECONDS,
    estimate_flight,
    haversine_meters,
)


# Reference points used across multiple tests.
ZAGREB = (45.8150, 15.9819)
SPLIT = (43.5081, 16.4402)
BERLIN = (52.5200, 13.4050)
MUNICH = (48.1351, 11.5820)
NEW_YORK = (40.7128, -74.0060)
LONDON = (51.5074, -0.1278)


def test_haversine_meters_zero_for_identical_points():
    assert haversine_meters(45.0, 15.0, 45.0, 15.0) == 0


def test_haversine_meters_zagreb_to_split_known_distance():
    # Zagreb → Split is ~260 km great-circle. Allow ±10 km slack.
    distance = haversine_meters(*ZAGREB, *SPLIT)
    assert 250_000 <= distance <= 270_000


def test_estimate_flight_skips_below_threshold():
    """Anything under MIN_FLIGHT_KM returns None — flying makes no sense there."""
    # Two points ~50 km apart.
    result = estimate_flight(45.0, 15.0, 45.0, 15.6)
    assert result is None


def test_estimate_flight_drops_zagreb_split_pair():
    """Zagreb→Split (~260 km) is above MIN_FLIGHT_KM=200 so we offer flight."""
    distance = haversine_meters(*ZAGREB, *SPLIT) / 1000.0
    assert distance > MIN_FLIGHT_KM
    result = estimate_flight(*ZAGREB, *SPLIT)
    assert result is not None
    assert result["mode"] == "flight"
    assert result["is_estimate"] is True
    assert result["geometry"] is None


def test_estimate_flight_berlin_munich_duration_in_expected_range():
    """Berlin → Munich is ~500 km. Cruise alone ≈ 38 min; +2h overhead → ≈2h 38min."""
    result = estimate_flight(*BERLIN, *MUNICH)
    assert result is not None
    assert result["distance_meters"] is not None
    distance_km = result["distance_meters"] / 1000.0
    assert 480 <= distance_km <= 520
    expected_min = TURNAROUND_OVERHEAD_SECONDS + int((distance_km / 800) * 3600) - 60
    expected_max = TURNAROUND_OVERHEAD_SECONDS + int((distance_km / 800) * 3600) + 60
    assert expected_min <= result["duration_seconds"] <= expected_max


def test_estimate_flight_long_haul_includes_overhead():
    """NYC → London (~5500 km): cruise ≈ 6h 53min, plus 2h overhead → ≈8h 53min."""
    result = estimate_flight(*NEW_YORK, *LONDON)
    assert result is not None
    distance_km = result["distance_meters"] / 1000.0
    assert 5400 <= distance_km <= 5700
    cruise_seconds = (distance_km / 800) * 3600
    expected = int(round(cruise_seconds + TURNAROUND_OVERHEAD_SECONDS))
    assert abs(result["duration_seconds"] - expected) <= 1
