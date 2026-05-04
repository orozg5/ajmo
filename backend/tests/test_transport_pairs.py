"""Smoke tests for the transport pair builder.

These tests verify the four phase-1 scenarios from docs/phases/phase-1.md:
1. Rome → Naples on the same day emits a pair with scope=same_day_cross_city.
2. Destination A (days 3-5) + B (days 1-2) yields pair B→A — sort by MIN(day_number), not sort_order alone.
3. Sentinel pair (empty city) produces a stable city-name-keyed cache entry; no LLM re-invocation on second fetch.
4. Mid-chain item removal evicts old pairs and regenerates the new adjacent pair.

The LLM is mocked — we're exercising the pair builder, ordering, and cache merge logic,
not real model output. Supabase is replaced by an in-memory dict for transport_suggestions.
"""
from unittest.mock import AsyncMock

import pytest

from app.services.ai import transport
from tests.conftest import make_day, make_destination, make_item


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def cache_store():
    """Mutable in-memory replacement for plans.transport_suggestions."""
    return {"same_day": {}, "cross_city": []}


@pytest.fixture(autouse=True)
def patch_cache(monkeypatch, cache_store):
    async def fake_read(plan_id: str):
        return {
            "same_day": {k: list(v) for k, v in (cache_store.get("same_day") or {}).items()},
            "cross_city": list(cache_store.get("cross_city") or []),
        }

    async def fake_write(plan_id: str, cache: dict):
        cache_store.clear()
        cache_store.update(cache)

    monkeypatch.setattr(transport, "read_full_cache", fake_read)
    monkeypatch.setattr(transport, "write_full_cache", fake_write)


@pytest.fixture
def llm_mock(monkeypatch):
    """Deterministic LLM stub — returns 2 generic options per pair."""
    async def fake_call(pairs):
        return [
            {
                "pair_index": i,
                "scope": p.get("scope", "same_day"),
                "options": [
                    {"name": "Walk", "one_line": "10 min · Free", "price_hint": "Free"},
                    {"name": "Taxi", "one_line": "5 min · ~$10", "price_hint": "~$10"},
                ],
            }
            for i, p in enumerate(pairs)
        ]

    mock = AsyncMock(side_effect=fake_call)
    monkeypatch.setattr(transport, "call_llm_for_transport", mock)
    return mock


# ── Tests ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_same_day_cross_city_pair(monkeypatch, llm_mock):
    """Two items on the same day in different cities → scope=same_day_cross_city."""
    rome = make_destination("R", "Rome", "Italy", days=[1])
    naples = make_destination("N", "Naples", "Italy", days=[1])
    colosseum = make_item("i1", "Colosseum", "R", sort_order=0)
    pompeii = make_item("i2", "Pompeii", "N", sort_order=1)
    day1 = make_day("D1", 1, [colosseum, pompeii])

    async def fake_days(plan_id):
        return [day1]

    async def fake_destinations(plan_id):
        return [rome, naples]

    monkeypatch.setattr(transport, "list_days_with_items", fake_days)
    monkeypatch.setattr(transport, "get_destinations_for_plan", fake_destinations)

    result = await transport.get_same_day_suggestions("P1", "D1")

    assert llm_mock.call_count == 1
    assert len(result) == 1
    assert result[0]["scope"] == "same_day_cross_city"
    assert result[0]["source_item_id"] == "i1"
    assert result[0]["destination_item_id"] == "i2"
    assert result[0]["source_city"] == "Rome"
    assert result[0]["destination_city"] == "Naples"
    assert len(result[0]["options"]) == 2


@pytest.mark.asyncio
async def test_cross_city_ordering_by_min_day_number(monkeypatch, llm_mock):
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
async def test_sentinel_pair_cache_stable(monkeypatch, llm_mock):
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
    assert llm_mock.call_count == 1
    assert len(first) == 1
    assert first[0]["source_item_id"] == "x"
    assert first[0]["destination_item_id"] is None  # B is a sentinel
    assert first[0]["source_city"] == "Alpha"
    assert first[0]["destination_city"] == "Bravo"

    second = await transport.get_cross_city_suggestions("P1")
    # Cache hit — LLM is not re-invoked.
    assert llm_mock.call_count == 1
    assert len(second) == 1
    assert second[0]["source_city"] == "Alpha"
    assert second[0]["destination_city"] == "Bravo"


@pytest.mark.asyncio
async def test_mid_chain_item_removal_regenerates(monkeypatch, llm_mock):
    """Day with X→Y→Z caches two pairs; removing Y evicts both and regenerates X→Z."""
    dest = make_destination("D", "Gamma", "Country", days=[1])
    x = make_item("x", "X", "D", sort_order=0)
    y = make_item("y", "Y", "D", sort_order=1)
    z = make_item("z", "Z", "D", sort_order=2)

    async def fake_destinations(plan_id):
        return [dest]

    monkeypatch.setattr(transport, "get_destinations_for_plan", fake_destinations)

    # First call: all three items present.
    day_xyz = make_day("D1", 1, [x, y, z])

    async def fake_days_full(plan_id):
        return [day_xyz]

    monkeypatch.setattr(transport, "list_days_with_items", fake_days_full)

    first = await transport.get_same_day_suggestions("P1", "D1")
    assert len(first) == 2
    pair_ids = {(s["source_item_id"], s["destination_item_id"]) for s in first}
    assert pair_ids == {("x", "y"), ("y", "z")}
    assert llm_mock.call_count == 1

    # Second call: Y removed → remaining items are X, Z.
    day_xz = make_day("D1", 1, [x, z])

    async def fake_days_minus_y(plan_id):
        return [day_xz]

    monkeypatch.setattr(transport, "list_days_with_items", fake_days_minus_y)

    second = await transport.get_same_day_suggestions("P1", "D1")
    assert len(second) == 1
    assert second[0]["source_item_id"] == "x"
    assert second[0]["destination_item_id"] == "z"
    assert llm_mock.call_count == 2  # new pair → new LLM invocation
