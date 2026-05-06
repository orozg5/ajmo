import logging

from fractional_indexing import generate_key_between

from app.db import get_supabase_client

logger = logging.getLogger(__name__)


HYDRATION_FIELDS = ("lat", "lng", "image_url", "description", "location", "timezone", "categories")


def hydrate_item(item: dict) -> dict:
    """Merge linked `places` row into `ai_data` so the frontend reads one shape.

    The expected input shape is the row returned by a Postgrest query that
    nested-selects `place:places(...)`. The nested key is popped and its
    fields are written into `ai_data` (overriding the snapshot — `places`
    is the source of truth for stable fields).
    """
    place = item.pop("place", None)
    if not place:
        return item
    ai_data = dict(item.get("ai_data") or {})
    for field in HYDRATION_FIELDS:
        value = place.get(field)
        if value is not None:
            ai_data[field] = value
    if place.get("id") is not None:
        ai_data["place_id"] = place["id"]
    item["ai_data"] = ai_data
    return item


# ── Service functions ─────────────────────────────────────────────────────────


async def create_item(plan_id: str, day_id: str, payload: dict) -> dict:
    """Insert a new plan item and return the hydrated row.

    Auto-assigns sort_key (fractional, for DnD) and sort_order (integer, for
    transport-pair sequencing and cross-city slot anchoring) when missing.
    """
    supabase = get_supabase_client()
    fill = dict(payload)
    if fill.get("sort_key") is None or fill.get("sort_order") is None:
        existing = (
            supabase.table("plan_items")
            .select("sort_key, sort_order")
            .eq("day_id", day_id)
            .execute()
        )
        if fill.get("sort_key") is None:
            keys = sorted(
                [row["sort_key"] for row in existing.data if row.get("sort_key")],
            )
            last_key = keys[-1] if keys else None
            fill["sort_key"] = generate_key_between(last_key, None)
        if fill.get("sort_order") is None:
            max_order = max(
                (row["sort_order"] for row in existing.data if row.get("sort_order") is not None),
                default=0,
            )
            fill["sort_order"] = max_order + 1000
    result = (
        supabase.table("plan_items")
        .insert({**fill, "plan_id": plan_id, "day_id": day_id})
        .execute()
    )
    if not result.data:
        raise ValueError(f"Failed to create item in day {day_id!r}")
    created = result.data[0]
    if created.get("place_id"):
        joined = (
            supabase.table("plan_items")
            .select("*, place:places(*)")
            .eq("id", created["id"])
            .limit(1)
            .execute()
        )
        if joined.data:
            return hydrate_item(joined.data[0])
    return created


async def delete_item(item_id: str) -> None:
    """Delete a plan item by id."""
    supabase = get_supabase_client()
    result = supabase.table("plan_items").delete().eq("id", item_id).execute()
    if not result.data:
        raise ValueError(f"Item {item_id!r} not found")


async def update_item_notes(item_id: str, notes: str | None) -> dict:
    """Update the notes field of a plan item and return the updated row."""
    supabase = get_supabase_client()
    result = (
        supabase.table("plan_items")
        .update({"notes": notes})
        .eq("id", item_id)
        .execute()
    )
    if not result.data:
        raise ValueError(f"Failed to update notes for item {item_id!r}")
    updated = result.data[0]
    if updated.get("place_id"):
        joined = (
            supabase.table("plan_items")
            .select("*, place:places(*)")
            .eq("id", item_id)
            .limit(1)
            .execute()
        )
        if joined.data:
            return hydrate_item(joined.data[0])
    return updated


async def reorder_items(plan_id: str, entries: list[dict]) -> list[dict]:
    """Apply a batch of (id, sort_key, day_id, destination_id) updates.

    All ids must belong to plan_id. Returns the fresh rows for the touched items.

    Side effect: deletes every transport item in any day touched by the reorder
    (union of pre-move and post-move day_ids). Transport rows describe a hop
    between specific adjacent items; once the order changes those pairings are
    invalid. The user regenerates via the inline bar or cross-city panel.
    """
    if not entries:
        return []
    supabase = get_supabase_client()
    ids = [entry["id"] for entry in entries]
    existing = (
        supabase.table("plan_items")
        .select("id, plan_id, day_id")
        .in_("id", ids)
        .execute()
    )
    wrong = [row for row in existing.data if row.get("plan_id") != plan_id]
    if wrong or len(existing.data) != len(ids):
        raise ValueError("One or more items do not belong to this plan")

    old_day_ids = {row["day_id"] for row in existing.data if row.get("day_id")}
    new_day_ids = {entry["day_id"] for entry in entries}
    touched_day_ids = list(old_day_ids | new_day_ids)

    updated_ids: list[str] = []
    for entry in entries:
        patch = {
            "sort_key": entry["sort_key"],
            "day_id": entry["day_id"],
            "destination_id": entry.get("destination_id"),
        }
        result = (
            supabase.table("plan_items")
            .update(patch)
            .eq("id", entry["id"])
            .execute()
        )
        if result.data:
            updated_ids.append(entry["id"])

    if touched_day_ids:
        supabase.table("plan_items") \
            .delete() \
            .eq("plan_id", plan_id) \
            .eq("item_type", "transport") \
            .in_("day_id", touched_day_ids) \
            .execute()

    if not updated_ids:
        return []
    fresh = (
        supabase.table("plan_items")
        .select("*, place:places(*)")
        .in_("id", updated_ids)
        .execute()
    )
    return [hydrate_item(row) for row in (fresh.data or [])]
