import logging

from app.db import get_supabase_client
from app.services.ai.llm import call_llm_with_fallback, parse_llm_json
from app.services.plans.days import list_days_with_items
from app.services.plans.destinations import get_destinations_for_plan

logger = logging.getLogger(__name__)


def resolve_item_location(item: dict, destinations_map: dict[str, dict]) -> str:
    """Return the best location string for an item, always including city/country context.

    Priority: ai_data.location > item.location > "City, Country" from destination.
    Never returns an empty string — always falls back to city/country.
    """
    ai_data = item.get("ai_data") or {}
    ai_loc = ai_data.get("location") if isinstance(ai_data, dict) else None

    raw_loc = (ai_loc or item.get("location") or "").strip()

    dest_id = item.get("destination_id")
    dest = destinations_map.get(dest_id) if dest_id else None
    city_country = f"{dest['city']}, {dest['country']}" if dest else ""

    if raw_loc and city_country and city_country.lower() not in raw_loc.lower():
        return f"{raw_loc}, {city_country}"
    if raw_loc:
        return raw_loc
    return city_country or "Unknown location"


def pair_key(item1: dict, item2: dict) -> str:
    """Generate a stable key for a pair of items."""
    return f"{item1.get('id', '')}->{item2.get('id', '')}"


def build_same_day_pairs(
    day_id: str,
    all_days: list[dict],
    destinations_map: dict[str, dict],
) -> list[dict]:
    """Build consecutive item pairs for a single day, within the same destination only.

    Only pairs consecutive items that share the same destination_id. Cross-destination
    transitions are handled exclusively by the cross-city endpoint.
    """
    target_day = next((d for d in all_days if d["id"] == day_id), None)
    if not target_day:
        return []

    items = sorted(
        [i for i in target_day.get("items", []) if i.get("item_type") != "transport"],
        key=lambda i: i.get("sort_order") or 0,
    )

    pairs = []
    for i in range(len(items) - 1):
        src = items[i]
        dst = items[i + 1]
        # Only pair items sharing the same destination. Cross-destination pairs
        # are the cross-city endpoint's responsibility.
        if src.get("destination_id") != dst.get("destination_id"):
            continue
        if src.get("destination_id") is None:
            continue
        dest = destinations_map.get(src["destination_id"])
        pairs.append({
            "source_item": src,
            "destination_item": dst,
            "scope": "same_day",
            "source_city": dest["city"] if dest else None,
            "destination_city": dest["city"] if dest else None,
            "source_country": dest["country"] if dest else None,
            "destination_country": dest["country"] if dest else None,
            "source_day_number": target_day["day_number"],
            "destination_day_number": target_day["day_number"],
        })
    return pairs


def last_day_for_dest(dest: dict, all_days: list[dict]) -> int | None:
    """Return the highest day_number assigned to this destination."""
    days_list = dest.get("days") or []
    return max(days_list) if days_list else (all_days[-1]["day_number"] if all_days else None)


def first_day_for_dest(dest: dict, all_days: list[dict]) -> int | None:
    """Return the lowest day_number assigned to this destination."""
    days_list = dest.get("days") or []
    return min(days_list) if days_list else (all_days[0]["day_number"] if all_days else None)


def cross_city_pair_key(pair: dict) -> str:
    """Generate a stable coverage key for a cross-city pair.

    When real items exist, keys by item IDs. For sentinel (empty-city) pairs, keys by
    city names so the backend can detect coverage even without item references.
    """
    src_id = pair["source_item"].get("id")
    dst_id = pair["destination_item"].get("id")
    if src_id and dst_id:
        return f"{src_id}->{dst_id}"
    return f"{pair['source_city']}->{pair['destination_city']}"


def build_cross_city_pairs(
    all_days: list[dict],
    destinations_map: dict[str, dict],
) -> list[dict]:
    """Build cross-city pairs: last item of destination N -> first item of destination N+1.

    Destinations are sorted by sort_order. When a destination has no non-transport items,
    a sentinel dict with id=None is used so the LLM still receives city names and can
    suggest realistic inter-city transport. Day numbers are tracked so the response
    carries the context needed by the frontend day picker.
    """
    items_by_dest: dict[str, list[tuple[int, dict]]] = {}

    for day in all_days:
        for item in day.get("items", []):
            if item.get("item_type") == "transport":
                continue
            dest_id = item.get("destination_id")
            if not dest_id:
                continue
            items_by_dest.setdefault(dest_id, []).append((day["day_number"], item))

    for dest_id in items_by_dest:
        items_by_dest[dest_id].sort(key=lambda t: (t[0], t[1].get("sort_order") or 0))

    sorted_dests = sorted(
        destinations_map.values(),
        key=lambda d: d.get("sort_order") or 0,
    )

    pairs = []
    for i in range(len(sorted_dests) - 1):
        src_dest = sorted_dests[i]
        dst_dest = sorted_dests[i + 1]
        src_items = items_by_dest.get(src_dest["id"], [])
        dst_items = items_by_dest.get(dst_dest["id"], [])

        # Use sentinel dicts for cities with no real items so the LLM still receives
        # city names and can suggest realistic inter-city transport.
        src_item = src_items[-1][1] if src_items else {
            "id": None,
            "title": src_dest["city"],
            "destination_id": src_dest["id"],
            "sort_order": None,
        }
        dst_item = dst_items[0][1] if dst_items else {
            "id": None,
            "title": dst_dest["city"],
            "destination_id": dst_dest["id"],
            "sort_order": None,
        }
        src_day = src_items[-1][0] if src_items else last_day_for_dest(src_dest, all_days)
        dst_day = dst_items[0][0] if dst_items else first_day_for_dest(dst_dest, all_days)

        pairs.append({
            "source_item": src_item,
            "destination_item": dst_item,
            "scope": "cross_city",
            "source_city": src_dest["city"],
            "destination_city": dst_dest["city"],
            "source_country": src_dest["country"],
            "destination_country": dst_dest["country"],
            "source_day_number": src_day,
            "destination_day_number": dst_day,
        })
    return pairs


def build_transport_prompt(pairs: list[dict]) -> str:
    """Build the LLM prompt for transport suggestions given a list of item pairs.

    Always includes city/country in location strings so the LLM has full geographic
    context and can suggest realistic inter-city transport where needed.
    """
    pairs_desc = []
    for i, pair in enumerate(pairs):
        src = pair["source_item"]
        dst = pair["destination_item"]
        src_loc = pair.get("source_resolved_location", "")
        dst_loc = pair.get("destination_resolved_location", "")
        scope = pair.get("scope", "same_day")
        scope_note = " [CROSS-CITY — inter-city transport required]" if scope == "cross_city" else ""
        pairs_desc.append(
            f"Pair {i + 1}{scope_note}: "
            f"From '{src.get('title', 'Unknown')}' at {src_loc} "
            f"to '{dst.get('title', 'Unknown')}' at {dst_loc}"
        )

    pairs_str = "\n".join(pairs_desc)

    return f"""You are a travel assistant. For each pair of locations below, suggest 2-3 best transport options.

{pairs_str}

Return ONLY valid JSON, no markdown:
{{"suggestions": [{{"pair_index": 0, "options": [{{"name": "...", "one_line": "...", "price_hint": "..."}}]}}]}}

Rules:
- pair_index: 0-based index matching the pairs above
- name: specific transport mode, e.g. "Amtrak Northeast Regional", "Flight", "Greyhound Bus", "Walk", "Metro Line 1", "Uber"
- one_line: max 50 chars, include time + rough cost, e.g. "3h 30min · ~$89 · Direct"
- price_hint: e.g. "~$89", "Free", "€€" or null
- CRITICAL: For pairs marked [CROSS-CITY], you MUST suggest realistic inter-city transport (flight, intercity train, intercity bus). NEVER suggest walk, metro, city bus, or rideshare (Uber/Lyft) for cross-city pairs.
- Be specific about operator names and route numbers when applicable"""


async def call_llm_for_transport(pairs: list[dict], temperature: float = 0.4) -> list[dict]:
    prompt = build_transport_prompt(pairs)
    raw_text = await call_llm_with_fallback(prompt, temperature=temperature)
    parsed = parse_llm_json(raw_text)

    suggestions = parsed.get("suggestions", [])
    if not isinstance(suggestions, list):
        raise ValueError("LLM transport response missing 'suggestions' list")

    return suggestions


def assemble_suggestions(pairs: list[dict], llm_results: list[dict]) -> list[dict]:
    """Assemble the final suggestion dicts from LLM results.

    Handles sentinel items (id=None) for cities with no real items — source_item_title
    falls back to the city name in that case. Reads resolved location strings from pair
    fields to ensure both locations are always correct and independent.
    """
    suggestions = []
    for llm_sug in llm_results:
        pair_idx = llm_sug.get("pair_index")
        if not isinstance(pair_idx, int) or pair_idx >= len(pairs):
            continue
        pair = pairs[pair_idx]
        options = llm_sug.get("options", [])
        if not isinstance(options, list):
            continue
        src = pair["source_item"]
        dst = pair["destination_item"]
        suggestions.append({
            "source_item_id": src.get("id"),
            "source_item_title": src.get("title"),
            "source_item_location": pair["source_resolved_location"],
            "destination_item_id": dst.get("id"),
            "destination_item_title": dst.get("title"),
            "destination_item_location": pair["destination_resolved_location"],
            "scope": pair.get("scope", "same_day"),
            "source_day_number": pair.get("source_day_number"),
            "destination_day_number": pair.get("destination_day_number"),
            "source_city": pair.get("source_city"),
            "destination_city": pair.get("destination_city"),
            "source_country": pair.get("source_country"),
            "destination_country": pair.get("destination_country"),
            "options": [
                {
                    "name": str(opt.get("name", "")),
                    "one_line": str(opt.get("one_line", ""))[:60] if opt.get("one_line") else None,
                    "price_hint": str(opt.get("price_hint")) if opt.get("price_hint") else None,
                }
                for opt in options
                if isinstance(opt, dict) and opt.get("name")
            ],
        })
    return suggestions


async def read_full_cache(plan_id: str) -> dict:
    """Read the transport_suggestions JSONB column. Returns a structured empty dict on miss."""
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
    """Overwrite the transport_suggestions JSONB column for the given plan."""
    supabase = get_supabase_client()
    supabase.table("plans").update({"transport_suggestions": cache}).eq("id", plan_id).execute()


async def get_same_day_suggestions(plan_id: str, day_id: str) -> list[dict]:
    """Generate transport suggestions for all consecutive item pairs within a single day.

    Pairs span across destination boundaries within the day, so same-day cross-city
    travel (e.g. Rocky Steps → White House) is handled correctly.
    Results are cached in transport_suggestions["same_day"][day_id].
    """
    all_days = await list_days_with_items(plan_id)
    destinations = await get_destinations_for_plan(plan_id)
    destinations_map = {d["id"]: d for d in destinations}

    target_day_data = next((d for d in all_days if d["id"] == day_id), None)
    transport_item_ids: set[str] = set()
    if target_day_data:
        transport_item_ids = {
            i["id"] for i in target_day_data.get("items", [])
            if i.get("item_type") == "transport"
        }

    # Compute expected pairs first so the cache can be validated against them.
    # If item C is inserted between A and B, the cached A→B pair must be dropped
    # and A→C, C→B generated fresh.
    all_pairs = build_same_day_pairs(day_id, all_days, destinations_map)
    expected_pair_keys = {
        pair_key(p["source_item"], p["destination_item"])
        for p in all_pairs
    }

    cache = await read_full_cache(plan_id)
    same_day_cache: dict[str, list] = cache.get("same_day") or {}
    if not isinstance(same_day_cache, dict):
        same_day_cache = {}

    cached_for_day = [
        s for s in (same_day_cache.get(day_id) or [])
        if s.get("source_item_id") not in transport_item_ids
        and s.get("destination_item_id") not in transport_item_ids
        and pair_key({"id": s["source_item_id"]}, {"id": s["destination_item_id"]}) in expected_pair_keys
    ]
    cached_pair_keys = {
        pair_key({"id": s["source_item_id"]}, {"id": s["destination_item_id"]})
        for s in cached_for_day
        if s.get("source_item_id") and s.get("destination_item_id")
    }

    new_pairs = [
        p for p in all_pairs
        if pair_key(p["source_item"], p["destination_item"]) not in cached_pair_keys
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
    """Generate transport suggestions for inter-city transitions only.

    For each consecutive destination pair: last item of city A -> first item of city B.
    Cities with no items use sentinel dicts so the LLM can still suggest city-to-city
    transport. Covered pairs (marked via ai_data.cross_city_pair on existing transport
    items) are excluded from the response so the frontend button disappears once all
    transitions are handled. Results are cached in transport_suggestions["cross_city"].
    """
    all_days = await list_days_with_items(plan_id)
    destinations = await get_destinations_for_plan(plan_id)
    destinations_map = {d["id"]: d for d in destinations}

    # Detect already-covered transitions by reading cross_city_pair markers stored in
    # ai_data when the user adds a cross-city transport item from the panel.
    covered_pair_keys: set[str] = set()
    for day in all_days:
        for item in day.get("items", []):
            if item.get("item_type") != "transport":
                continue
            ai_data = item.get("ai_data") or {}
            if isinstance(ai_data, dict) and ai_data.get("cross_city_pair"):
                covered_pair_keys.add(str(ai_data["cross_city_pair"]))

    transport_item_ids = {
        i["id"]
        for day in all_days
        for i in day.get("items", [])
        if i.get("item_type") == "transport"
    }

    # Compute expected pairs then immediately exclude covered transitions.
    all_pairs = build_cross_city_pairs(all_days, destinations_map)
    all_pairs = [p for p in all_pairs if cross_city_pair_key(p) not in covered_pair_keys]

    expected_pair_keys = {
        pair_key(p["source_item"], p["destination_item"])
        for p in all_pairs
    }

    cache = await read_full_cache(plan_id)
    raw_cross_city: list = cache.get("cross_city") or []
    if not isinstance(raw_cross_city, list):
        raw_cross_city = []

    cached_cross_city = [
        s for s in raw_cross_city
        if s.get("source_item_id") not in transport_item_ids
        and s.get("destination_item_id") not in transport_item_ids
        and pair_key({"id": s["source_item_id"]}, {"id": s["destination_item_id"]}) in expected_pair_keys
    ]

    cached_pair_keys = {
        pair_key({"id": s["source_item_id"]}, {"id": s["destination_item_id"]})
        for s in cached_cross_city
        if s.get("source_item_id") and s.get("destination_item_id")
    }

    new_pairs = [
        p for p in all_pairs
        if pair_key(p["source_item"], p["destination_item"]) not in cached_pair_keys
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
