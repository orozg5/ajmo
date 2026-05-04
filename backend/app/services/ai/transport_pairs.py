"""Pair-graph construction for transport suggestions.

Pure functions — no Supabase, no LLM. Given the days/destinations graph, these
helpers produce the source→destination item pairs that the LLM is asked to
annotate with transport options.
"""
import logging

logger = logging.getLogger(__name__)


def resolve_item_location(item: dict, destinations_map: dict[str, dict]) -> str:
    """Return the best location string for an item, always including city/country.

    Priority: ai_data.location > item.location > "City, Country" from destination.
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


def pair_key(pair: dict) -> str:
    """Stable key for a pair dict.

    Item-id keyed when both endpoints have a real id; city-name keyed when
    either is a sentinel (id is None) — city names are pulled from the pair's
    `source_city` / `destination_city` so the key stays consistent with
    `suggestion_pair_key` on cache reads. This prevents None->None collisions
    across independent sentinel pairs.
    """
    src = pair["source_item"]
    dst = pair["destination_item"]
    src_id = src.get("id")
    dst_id = dst.get("id")
    if src_id and dst_id:
        return f"{src_id}->{dst_id}"
    src_key = pair.get("source_city") or src.get("title")
    dst_key = pair.get("destination_city") or dst.get("title")
    return f"city:{src_key}->city:{dst_key}"


def build_same_day_pairs(
    day_id: str,
    all_days: list[dict],
    destinations_map: dict[str, dict],
) -> list[dict]:
    """Day-walk pair builder: every adjacency in the day, tagged by scope.

    - `same_day` when both items share a destination_id.
    - `same_day_cross_city` when they differ (or either is missing a destination).
    Transport items are excluded from the walk.
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
        src_dest = destinations_map.get(src.get("destination_id"))
        dst_dest = destinations_map.get(dst.get("destination_id"))
        same_dest = (
            src.get("destination_id") is not None
            and src.get("destination_id") == dst.get("destination_id")
        )
        scope = "same_day" if same_dest else "same_day_cross_city"
        pairs.append({
            "source_item": src,
            "destination_item": dst,
            "scope": scope,
            "source_city": src_dest["city"] if src_dest else None,
            "destination_city": dst_dest["city"] if dst_dest else None,
            "source_country": src_dest["country"] if src_dest else None,
            "destination_country": dst_dest["country"] if dst_dest else None,
            "source_day_number": target_day["day_number"],
            "destination_day_number": target_day["day_number"],
        })
    return pairs


def last_day_for_dest(dest: dict) -> int | None:
    """Highest day_number assigned to this destination, or None if unmapped."""
    days_list = dest.get("days") or []
    return max(days_list) if days_list else None


def first_day_for_dest(dest: dict) -> int | None:
    """Lowest day_number assigned to this destination, or None if unmapped."""
    days_list = dest.get("days") or []
    return min(days_list) if days_list else None


def build_cross_city_pairs(
    all_days: list[dict],
    destinations_map: dict[str, dict],
) -> list[dict]:
    """Cross-city pairs: last item of city A → first item of city B.

    Destinations are sorted by `MIN(day_number) FROM plan_destination_days` then by
    `sort_order`. Destinations with no days mapped sort last. Sentinel dicts
    (id=None) fill in for cities with no non-transport items so the LLM still gets
    city context.
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

    def sort_key(dest: dict) -> tuple:
        first = first_day_for_dest(dest)
        first_key = first if first is not None else 10**9
        return (first_key, dest.get("sort_order") or 0)

    sorted_dests = sorted(destinations_map.values(), key=sort_key)

    pairs = []
    for i in range(len(sorted_dests) - 1):
        src_dest = sorted_dests[i]
        dst_dest = sorted_dests[i + 1]
        src_items = items_by_dest.get(src_dest["id"], [])
        dst_items = items_by_dest.get(dst_dest["id"], [])

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
        src_day = src_items[-1][0] if src_items else last_day_for_dest(src_dest)
        dst_day = dst_items[0][0] if dst_items else first_day_for_dest(dst_dest)
        if src_day is None or dst_day is None:
            logger.info(
                "Skipping cross-city pair %s→%s: destination has no days mapped",
                src_dest["city"], dst_dest["city"],
            )
            continue

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
