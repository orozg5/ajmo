import logging

from app.db import get_supabase_client

logger = logging.getLogger(__name__)


# ── Service functions ─────────────────────────────────────────────────────────


async def create_destination(
    plan_id: str,
    country: str,
    city: str,
    sort_order: int,
    day_numbers: list[int],
) -> dict:
    """Insert a plan_destination row and its day assignments, return the created destination."""
    supabase = get_supabase_client()
    result = (
        supabase.table("plan_destinations")
        .insert({"plan_id": plan_id, "country": country, "city": city, "sort_order": sort_order})
        .execute()
    )
    if not result.data:
        raise ValueError(f"Failed to create destination for plan {plan_id!r}")
    destination = result.data[0]

    if day_numbers:
        day_rows = [{"destination_id": destination["id"], "day_number": d} for d in day_numbers]
        supabase.table("plan_destination_days").insert(day_rows).execute()

    destination["days"] = day_numbers
    return destination


async def get_destinations_for_plan(plan_id: str) -> list[dict]:
    """Return all destinations for a plan, each with a `days` list populated."""
    supabase = get_supabase_client()
    result = (
        supabase.table("plan_destinations")
        .select("*")
        .eq("plan_id", plan_id)
        .order("sort_order")
        .execute()
    )
    destinations = result.data or []

    for dest in destinations:
        days_result = (
            supabase.table("plan_destination_days")
            .select("day_number")
            .eq("destination_id", dest["id"])
            .execute()
        )
        dest["days"] = [row["day_number"] for row in (days_result.data or [])]

    return destinations


async def delete_destination(destination_id: str) -> None:
    """Delete a destination; cascade removes day assignments and nulls plan_items.destination_id."""
    supabase = get_supabase_client()
    result = (
        supabase.table("plan_destinations")
        .delete()
        .eq("id", destination_id)
        .execute()
    )
    if not result.data:
        raise ValueError(f"Destination {destination_id!r} not found")
