"""Smoke tests for the cross-city transport pair builder + cache merge.

Same-day same-city routing is handled deterministically by the frontend via
OSRM and the /transit/directions endpoint. Cross-city goes through a backend
multi-source orchestrator (OSRM driving + Transitous train/bus/ferry +
haversine flight estimator) — no LLM at any point.

The orchestrator is mocked in these tests; we're exercising the pair builder,
ordering, and cache merge logic. Supabase is replaced by an in-memory dict
for transport_suggestions.
"""
from unittest.mock import AsyncMock

import pytest

from app.services.ai import transport
from tests.conftest import make_day, make_destination, make_item


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def cache_store():
    """Mutable in-memory replacement for plans.transport_suggestions."""
    return {"cross_city": []}


@pytest.fixture(autouse=True)
def patch_cache(monkeypatch, cache_store):
    async def fake_read(plan_id: str):
        return {"cross_city": list(cache_store.get("cross_city") or [])}

    async def fake_write(plan_id: str, cache: dict):
        cache_store.clear()
        cache_store.update(cache)

    monkeypatch.setattr(transport, "read_full_cache", fake_read)
    monkeypatch.setattr(transport, "write_full_cache", fake_write)


@pytest.fixture
def orchestrator_mock(monkeypatch):
    """Deterministic API-orchestrator stub — emits one assembled suggestion per pair.

    Mirrors the real `generate_options_for_pairs` shape: each pair gets a
    suggestion dict with `options` carrying `mode`+`duration_seconds`+
    `distance_meters`, so the cache-version guard treats them as fresh entries.
    """
    async def fake_generate(pairs):
        return [
            {
                "source_item_id": p["source_item"].get("id"),
                "source_item_title": p["source_item"].get("title"),
                "source_item_location": p.get("source_resolved_location"),
                "source_destination_id": p["source_item"].get("destination_id"),
                "destination_item_id": p["destination_item"].get("id"),
                "destination_item_title": p["destination_item"].get("title"),
                "destination_item_location": p.get("destination_resolved_location"),
                "destination_destination_id": p["destination_item"].get("destination_id"),
                "scope": p.get("scope", "cross_city"),
                "source_day_number": p.get("source_day_number"),
                "destination_day_number": p.get("destination_day_number"),
                "source_city": p.get("source_city"),
                "destination_city": p.get("destination_city"),
                "source_country": p.get("source_country"),
                "destination_country": p.get("destination_country"),
                "options": [
                    {
                        "mode": "flight",
                        "name": "Flight",
                        "duration_seconds": 5400,
                        "distance_meters": 600_000,
                        "is_estimate": True,
                        "transit_summary": None,
                        "geometry": None,
                    },
                ],
            }
            for p in pairs
        ]

    mock = AsyncMock(side_effect=fake_generate)
    monkeypatch.setattr(transport, "generate_options_for_pairs", mock)
    return mock


# ── Tests ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cross_city_ordering_by_min_day_number(monkeypatch, orchestrator_mock):
    """A on days 3-5 (sort_order=0), B on days 1-2 (sort_order=1): pair is B→A."""
    dest_a = make_destination("A", "Alpha", "Country", days=[3, 4, 5], sort_order=0)
    dest_b = make_destination("B", "Bravo", "Country", days=[1, 2], sort_order=1)
    x = make_item("x", "X-item", "B", sort_order=0)
    y = make_item("y", "Y-item", "A", sort_order=0)
    day1 = make_day("D1", 1, [x])
    day3 = make_day("D3", 3, [y])

    async def fake_days(plan_id):
        return [day1, day3]

    async def fake_destinations(plan_id):
        return [dest_a, dest_b]

    monkeypatch.setattr(transport, "list_days_with_items", fake_days)
    monkeypatch.setattr(transport, "get_destinations_for_plan", fake_destinations)

    result = await transport.get_cross_city_suggestions("P1")

    assert len(result) == 1
    # B is visited first (day 1), so pair goes B → A despite sort_order putting A first.
    assert result[0]["source_city"] == "Bravo"
    assert result[0]["destination_city"] == "Alpha"
    assert result[0]["source_item_id"] == "x"
    assert result[0]["destination_item_id"] == "y"
    assert result[0]["source_day_number"] == 1
    assert result[0]["destination_day_number"] == 3


@pytest.mark.asyncio
async def test_sentinel_pair_cache_stable(monkeypatch, orchestrator_mock):
    """Sentinel destination_item (id=None) uses a city-name key; second fetch hits cache."""
    dest_a = make_destination("A", "Alpha", "Country", days=[1], sort_order=0)
    dest_b = make_destination("B", "Bravo", "Country", days=[2], sort_order=1)
    item_x = make_item("x", "X-item", "A", sort_order=0)
    day1 = make_day("D1", 1, [item_x])
    day2 = make_day("D2", 2, [])

    async def fake_days(plan_id):
        return [day1, day2]

    async def fake_destinations(plan_id):
        return [dest_a, dest_b]

    monkeypatch.setattr(transport, "list_days_with_items", fake_days)
    monkeypatch.setattr(transport, "get_destinations_for_plan", fake_destinations)

    first = await transport.get_cross_city_suggestions("P1")
    assert orchestrator_mock.call_count == 1
    assert len(first) == 1
    assert first[0]["source_item_id"] == "x"
    assert first[0]["destination_item_id"] is None  # B is a sentinel
    assert first[0]["source_city"] == "Alpha"
    assert first[0]["destination_city"] == "Bravo"

    second = await transport.get_cross_city_suggestions("P1")
    # Cache hit — orchestrator is not re-invoked.
    assert orchestrator_mock.call_count == 1
    assert len(second) == 1
    assert second[0]["source_city"] == "Alpha"
    assert second[0]["destination_city"] == "Bravo"


@pytest.mark.asyncio
async def test_legacy_cache_is_dropped(monkeypatch, orchestrator_mock, cache_store):
    """Pre-change cached entries (no `mode` on options) trigger a full regeneration."""
    cache_store["cross_city"] = [
        {
            "source_item_id": "x",
            "destination_item_id": "y",
            "source_city": "Alpha",
            "destination_city": "Bravo",
            "options": [
                {"name": "Intercity train", "one_line": "4h · ~$45", "price_hint": "~$45"},
            ],
        }
    ]

    dest_a = make_destination("A", "Alpha", "Country", days=[1], sort_order=0)
    dest_b = make_destination("B", "Bravo", "Country", days=[2], sort_order=1)
    item_x = make_item("x", "X-item", "A", sort_order=0)
    item_y = make_item("y", "Y-item", "B", sort_order=0)
    day1 = make_day("D1", 1, [item_x])
    day2 = make_day("D2", 2, [item_y])

    async def fake_days(plan_id):
        return [day1, day2]

    async def fake_destinations(plan_id):
        return [dest_a, dest_b]

    monkeypatch.setattr(transport, "list_days_with_items", fake_days)
    monkeypatch.setattr(transport, "get_destinations_for_plan", fake_destinations)

    result = await transport.get_cross_city_suggestions("P1")

    # Legacy cache was wiped on read; orchestrator regenerated the pair fresh.
    assert orchestrator_mock.call_count == 1
    assert len(result) == 1
    assert result[0]["options"][0]["mode"] == "flight"
