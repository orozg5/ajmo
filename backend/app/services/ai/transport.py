"""Transport suggestion orchestrators + cache helpers.

Public surface for same-day and cross-city transport generation. Composes the
pair graph (`transport_pairs`) with the LLM pipeline (`transport_llm`) and
persists results in `plans.transport_suggestions`.
"""
import logging

from app.db import get_supabase_client
from app.services.ai.transport_llm import (
    assemble_suggestions,
    call_llm_for_transport,
    stream_transport_for_pairs,
)
from app.services.ai.transport_pairs import (
    build_cross_city_pairs,
    build_same_day_pairs,
    pair_key,
    resolve_item_location,
)
from app.services.plans.days import list_days_with_items
from app.services.plans.destinations import get_destinations_for_plan

logger = logging.getLogger(__name__)


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
        if isinstance(val, dict) and ("same_day" in val or "cross_city" in val):
            return val
    return {"same_day": {}, "cross_city": []}


async def write_full_cache(plan_id: str, cache: dict) -> None:
    supabase = get_supabase_client()
    supabase.table("plans").update({"transport_suggestions": cache}).eq("id", plan_id).execute()


def suggestion_pair_key(suggestion: dict) -> str:
    """Rebuild pair_key from a cached suggestion dict for cache-validity checks."""
    src_id = suggestion.get("source_item_id")
    dst_id = suggestion.get("destination_item_id")
    if src_id and dst_id:
        return f"{src_id}->{dst_id}"
    return f"city:{suggestion.get('source_city')}->city:{suggestion.get('destination_city')}"


async def get_same_day_suggestions(plan_id: str, day_id: str) -> list[dict]:
    """Generate transport suggestions for all consecutive pairs within a single day.

    Pairs span across destination boundaries, so same-day cross-city transitions
    (e.g. Rome → Naples on the same day) produce a pair with scope
    `same_day_cross_city`. Covered pairs are excluded via `ai_data.same_day_pair`
    on transport items in the same day. Results cached in
    transport_suggestions["same_day"][day_id].
    """
    all_days = await list_days_with_items(plan_id)
    destinations = await get_destinations_for_plan(plan_id)
    destinations_map = {d["id"]: d for d in destinations}

    target_day = next((d for d in all_days if d["id"] == day_id), None)
    transport_item_ids: set[str] = set()
    covered_pair_keys: set[str] = set()
    if target_day:
        for item in target_day.get("items", []):
            if item.get("item_type") != "transport":
                continue
            transport_item_ids.add(item["id"])
            ai_data = item.get("ai_data") or {}
            if isinstance(ai_data, dict) and ai_data.get("same_day_pair"):
                covered_pair_keys.add(str(ai_data["same_day_pair"]))

    all_pairs = build_same_day_pairs(day_id, all_days, destinations_map)
    all_pairs = [p for p in all_pairs if pair_key(p) not in covered_pair_keys]

    expected_pair_keys = {
        pair_key(p) for p in all_pairs
    }

    cache = await read_full_cache(plan_id)
    same_day_cache: dict[str, list] = cache.get("same_day") or {}
    if not isinstance(same_day_cache, dict):
        same_day_cache = {}

    cached_for_day = [
        s for s in (same_day_cache.get(day_id) or [])
        if s.get("source_item_id") not in transport_item_ids
        and s.get("destination_item_id") not in transport_item_ids
        and suggestion_pair_key(s) in expected_pair_keys
    ]
    cached_pair_keys = {suggestion_pair_key(s) for s in cached_for_day}

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
            "Generating same-day transport for %d new pairs (plan %s, day %s)",
            len(new_pairs), plan_id, day_id,
        )
        llm_results = await call_llm_for_transport(new_pairs)
        new_suggestions = assemble_suggestions(new_pairs, llm_results)

    combined = cached_for_day + new_suggestions
    if new_suggestions:
        same_day_cache[day_id] = combined
        cache["same_day"] = same_day_cache
        await write_full_cache(plan_id, cache)

    return combined


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

    cache = await read_full_cache(plan_id)
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
        llm_results = await call_llm_for_transport(new_pairs)
        new_suggestions = assemble_suggestions(new_pairs, llm_results)

    combined = cached_cross_city + new_suggestions
    if new_suggestions:
        cache["cross_city"] = combined
        await write_full_cache(plan_id, cache)

    return combined


async def stream_same_day_suggestions(plan_id: str, day_id: str):
    """Yield same-day transport suggestion dicts. Cached first, then streamed new ones.

    Writes the combined list to transport_suggestions["same_day"][day_id] after
    the LLM stream completes.
    """
    all_days = await list_days_with_items(plan_id)
    destinations = await get_destinations_for_plan(plan_id)
    destinations_map = {d["id"]: d for d in destinations}

    target_day = next((d for d in all_days if d["id"] == day_id), None)
    transport_item_ids: set[str] = set()
    covered_pair_keys: set[str] = set()
    if target_day:
        for item in target_day.get("items", []):
            if item.get("item_type") != "transport":
                continue
            transport_item_ids.add(item["id"])
            ai_data = item.get("ai_data") or {}
            if isinstance(ai_data, dict) and ai_data.get("same_day_pair"):
                covered_pair_keys.add(str(ai_data["same_day_pair"]))

    all_pairs = build_same_day_pairs(day_id, all_days, destinations_map)
    all_pairs = [
        p for p in all_pairs
        if pair_key(p) not in covered_pair_keys
    ]
    expected_pair_keys = {
        pair_key(p) for p in all_pairs
    }

    cache = await read_full_cache(plan_id)
    same_day_cache: dict[str, list] = cache.get("same_day") or {}
    if not isinstance(same_day_cache, dict):
        same_day_cache = {}

    cached_for_day = [
        s for s in (same_day_cache.get(day_id) or [])
        if s.get("source_item_id") not in transport_item_ids
        and s.get("destination_item_id") not in transport_item_ids
        and suggestion_pair_key(s) in expected_pair_keys
    ]
    cached_pair_keys = {suggestion_pair_key(s) for s in cached_for_day}

    for suggestion in cached_for_day:
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
        "Streaming same-day transport for %d new pairs (plan %s, day %s)",
        len(new_pairs), plan_id, day_id,
    )

    new_suggestions: list[dict] = []
    async for assembled in stream_transport_for_pairs(new_pairs):
        new_suggestions.append(assembled)
        yield assembled

    if new_suggestions:
        same_day_cache[day_id] = cached_for_day + new_suggestions
        cache["same_day"] = same_day_cache
        await write_full_cache(plan_id, cache)


async def stream_cross_city_suggestions(plan_id: str):
    """Yield cross-city transport suggestion dicts. Cached first, then streamed new ones.

    Writes the combined list to transport_suggestions["cross_city"] after the LLM
    stream completes.
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

    cache = await read_full_cache(plan_id)
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
    async for assembled in stream_transport_for_pairs(new_pairs):
        new_suggestions.append(assembled)
        yield assembled

    if new_suggestions:
        cache["cross_city"] = cached_cross_city + new_suggestions
        await write_full_cache(plan_id, cache)
