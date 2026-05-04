import logging

from fractional_indexing import generate_key_between

from app.db import get_supabase_client

logger = logging.getLogger(__name__)


# ── Service functions ─────────────────────────────────────────────────────────


async def create_item(plan_id: str, day_id: str, payload: dict) -> dict:
    """Insert a new plan item and return the created row.

    Auto-assigns sort_key if missing (appended after the last item in the day).
    Auto-assigns sort_order for one release safety net.
    """
    supabase = get_supabase_client()
    fill = dict(payload)
    if fill.get("sort_key") is None:
        existing = (
            supabase.table("plan_items")
            .select("sort_key")
            .eq("day_id", day_id)
            .execute()
        )
        keys = sorted(
            [row["sort_key"] for row in existing.data if row.get("sort_key")],
        )
        last_key = keys[-1] if keys else None
        fill["sort_key"] = generate_key_between(last_key, None)
    if fill.get("sort_order") is None:
        existing_orders = (
            supabase.table("plan_items")
            .select("sort_order")
            .eq("day_id", day_id)
            .execute()
        )
        max_order = max(
            (row["sort_order"] for row in existing_orders.data if row.get("sort_order") is not None),
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
    return result.data[0]


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
    return result.data[0]


async def reorder_items(plan_id: str, entries: list[dict]) -> list[dict]:
    """Apply a batch of (id, sort_key, day_id, destination_id) updates.

    All ids must belong to plan_id. Returns the fresh rows for the touched items.
    """
    if not entries:
        return []
    supabase = get_supabase_client()
    ids = [entry["id"] for entry in entries]
    existing = (
        supabase.table("plan_items")
        .select("id, plan_id")
        .in_("id", ids)
        .execute()
    )
    wrong = [row for row in existing.data if row.get("plan_id") != plan_id]
    if wrong or len(existing.data) != len(ids):
        raise ValueError("One or more items do not belong to this plan")

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

    if not updated_ids:
        return []
    fresh = (
        supabase.table("plan_items")
        .select("*")
        .in_("id", updated_ids)
        .execute()
    )
    return fresh.data or []
