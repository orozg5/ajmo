"""Cross-city transport orchestrator + cache helpers.

Public surface for cross-city transport generation. Composes the pair graph
(`transport_pairs`) with the multi-source orchestrator
(`services/transport/cross_city`) — OSRM driving + Transitous train/bus/ferry +
haversine flight estimator — and persists results in
`plans.transport_suggestions`. No LLM is called from this path.
"""
import logging

from app.db import get_supabase_client
from app.services.ai.transport_pairs import (
    build_cross_city_pairs,
    pair_key,
    resolve_item_location,
)
from app.services.plans.days import list_days_with_items
from app.services.plans.destinations import get_destinations_for_plan
from app.services.transport.cross_city import (
    generate_options_for_pairs,
    stream_options_for_pairs,
)

logger = logging.getLogger(__name__)


def is_legacy_suggestion(suggestion: dict) -> bool:
    """True for cached entries from the old LLM pipeline (no `mode` on options).

    The new orchestrator always emits `mode` per option; legacy entries have
    only `name` + `one_line` + `price_hint`. Dropping them on read forces a
    fresh regeneration with real routing data.
    """
    options = suggestion.get("options") or []
    if not options:
        return True
    first = options[0]
    return not (isinstance(first, dict) and "mode" in first)


async def read_full_cache(plan_id: str) -> dict:
    supabase = get_supabase_client()
    result = (
        supabase.table("plans")
        .select("transport_suggestions")
        .eq("id", plan_id)
        .limit(1)
        .execute()
    )
    if result.data:
        val = result.data[0].get("transport_suggestions")
        if isinstance(val, dict) and "cross_city" in val:
            return val
    return {"cross_city": []}


def filter_legacy_cache(cache: dict) -> dict:
    """Drop the cross_city array entirely if any entry uses the pre-API shape.

    Pre-change cached entries (LLM-era) lack a `mode` field on options; the new
    orchestrator always emits one. Mixing shapes would force a runtime
    discriminator on the frontend, so we wipe and regenerate on first read.
    """
    cross_city = cache.get("cross_city") or []
    if isinstance(cross_city, list) and any(
        is_legacy_suggestion(s) for s in cross_city if isinstance(s, dict)
    ):
        return {**cache, "cross_city": []}
    return cache


async def write_full_cache(plan_id: str, cache: dict) -> None:
    supabase = get_supabase_client()
    supabase.table("plans").update({"transport_suggestions": cache}).eq("id", plan_id).execute()


def suggestion_pair_key(suggestion: dict) -> str:
    """Rebuild pair_key from a cached suggestion dict for cache-validity checks."""
    src_dest_id = suggestion.get("source_destination_id")
    dst_dest_id = suggestion.get("destination_destination_id")
    return f"{src_dest_id}->{dst_dest_id}"


async def get_cross_city_suggestions(plan_id: str) -> list[dict]:
    """Generate transport for inter-city transitions only.

    For each consecutive destination pair (sorted by MIN(day_number) then
    sort_order): last item of city A → first item of city B. Covered pairs are
    excluded via `ai_data.cross_city_pair` on transport items. Results cached in
    transport_suggestions["cross_city"].
    """
    all_days = await list_days_with_items(plan_id)
    destinations = await get_destinations_for_plan(plan_id)
    destinations_map = {d["id"]: d for d in destinations}

    covered_pair_keys: set[str] = set()
    transport_item_ids: set[str] = set()
    for day in all_days:
        for item in day.get("items", []):
            if item.get("item_type") != "transport":
                continue
            transport_item_ids.add(item["id"])
            ai_data = item.get("ai_data") or {}
            if isinstance(ai_data, dict) and ai_data.get("cross_city_pair"):
                covered_pair_keys.add(str(ai_data["cross_city_pair"]))

    all_pairs = build_cross_city_pairs(all_days, destinations_map)
    all_pairs = [p for p in all_pairs if pair_key(p) not in covered_pair_keys]

    expected_pair_keys = {
        pair_key(p) for p in all_pairs
    }

    cache = filter_legacy_cache(await read_full_cache(plan_id))
    raw_cross_city: list = cache.get("cross_city") or []
    if not isinstance(raw_cross_city, list):
        raw_cross_city = []

    cached_cross_city = [
        s for s in raw_cross_city
        if s.get("source_item_id") not in transport_item_ids
        and s.get("destination_item_id") not in transport_item_ids
        and suggestion_pair_key(s) in expected_pair_keys
    ]
    cached_pair_keys = {suggestion_pair_key(s) for s in cached_cross_city}

    new_pairs = [
        p for p in all_pairs
        if pair_key(p) not in cached_pair_keys
    ]

    for p in new_pairs:
        p["source_resolved_location"] = resolve_item_location(p["source_item"], destinations_map)
        p["destination_resolved_location"] = resolve_item_location(p["destination_item"], destinations_map)

    new_suggestions: list[dict] = []
    if new_pairs:
        logger.info(
            "Generating cross-city transport for %d new pairs (plan %s)",
            len(new_pairs), plan_id,
        )
        new_suggestions = await generate_options_for_pairs(new_pairs)

    combined = cached_cross_city + new_suggestions
    if new_suggestions:
        cache["cross_city"] = combined
        await write_full_cache(plan_id, cache)

    return combined


async def stream_cross_city_suggestions(plan_id: str):
    """Yield cross-city transport suggestion dicts. Cached first, then streamed new ones.

    Writes the combined list to transport_suggestions["cross_city"] after the
    fan-out finishes.
    """
    all_days = await list_days_with_items(plan_id)
    destinations = await get_destinations_for_plan(plan_id)
    destinations_map = {d["id"]: d for d in destinations}

    covered_pair_keys: set[str] = set()
    transport_item_ids: set[str] = set()
    for day in all_days:
        for item in day.get("items", []):
            if item.get("item_type") != "transport":
                continue
            transport_item_ids.add(item["id"])
            ai_data = item.get("ai_data") or {}
            if isinstance(ai_data, dict) and ai_data.get("cross_city_pair"):
                covered_pair_keys.add(str(ai_data["cross_city_pair"]))

    all_pairs = build_cross_city_pairs(all_days, destinations_map)
    all_pairs = [
        p for p in all_pairs
        if pair_key(p) not in covered_pair_keys
    ]
    expected_pair_keys = {
        pair_key(p) for p in all_pairs
    }

    cache = filter_legacy_cache(await read_full_cache(plan_id))
    raw_cross_city: list = cache.get("cross_city") or []
    if not isinstance(raw_cross_city, list):
        raw_cross_city = []

    cached_cross_city = [
        s for s in raw_cross_city
        if s.get("source_item_id") not in transport_item_ids
        and s.get("destination_item_id") not in transport_item_ids
        and suggestion_pair_key(s) in expected_pair_keys
    ]
    cached_pair_keys = {suggestion_pair_key(s) for s in cached_cross_city}

    for suggestion in cached_cross_city:
        yield suggestion

    new_pairs = [
        p for p in all_pairs
        if pair_key(p) not in cached_pair_keys
    ]
    if not new_pairs:
        return

    for p in new_pairs:
        p["source_resolved_location"] = resolve_item_location(p["source_item"], destinations_map)
        p["destination_resolved_location"] = resolve_item_location(p["destination_item"], destinations_map)

    logger.info(
        "Streaming cross-city transport for %d new pairs (plan %s)",
        len(new_pairs), plan_id,
    )

    new_suggestions: list[dict] = []
    async for assembled in stream_options_for_pairs(new_pairs):
        new_suggestions.append(assembled)
        yield assembled

    if new_suggestions:
        cache["cross_city"] = cached_cross_city + new_suggestions
        await write_full_cache(plan_id, cache)
