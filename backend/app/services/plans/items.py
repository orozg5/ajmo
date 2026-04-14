import logging

from app.db import get_supabase_client

logger = logging.getLogger(__name__)


# ── Service functions ─────────────────────────────────────────────────────────


async def create_item(plan_id: str, day_id: str, payload: dict) -> dict:
    """Insert a new plan item and return the created row."""
    supabase = get_supabase_client()
    if "sort_order" not in payload or payload.get("sort_order") is None:
        existing = supabase.table("plan_items").select("sort_order").eq("day_id", day_id).execute()
        max_order = max(
            (row["sort_order"] for row in existing.data if row.get("sort_order") is not None),
            default=0,
        )
        payload = {**payload, "sort_order": max_order + 1000}
    result = (
        supabase.table("plan_items")
        .insert({**payload, "plan_id": plan_id, "day_id": day_id})
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
