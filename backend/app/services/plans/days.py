import logging
from datetime import date, timedelta

from app.db import get_supabase_client

logger = logging.getLogger(__name__)


# ── Service functions ─────────────────────────────────────────────────────────


async def initialize_days(plan_id: str, date_from: date | str | None, date_to: date | str | None) -> list[dict]:
    """Idempotent: create days for the plan if none exist yet.

    - If days already exist, return them unchanged.
    - If date_from and date_to are both set, create one day per calendar date.
    - Otherwise create a single Day 1 with no date.

    Accepts date objects or ISO date strings (as returned by Supabase).
    """
    supabase = get_supabase_client()
    existing = supabase.table("plan_days").select("*").eq("plan_id", plan_id).execute()
    if existing.data:
        return existing.data

    # Normalise to date objects if strings were passed in
    if isinstance(date_from, str):
        date_from = date.fromisoformat(date_from)
    if isinstance(date_to, str):
        date_to = date.fromisoformat(date_to)

    if date_from and date_to:
        days_to_insert = []
        current = date_from
        day_number = 1
        while current <= date_to:
            days_to_insert.append({
                "plan_id": plan_id,
                "day_number": day_number,
                "date": current.isoformat(),
            })
            current += timedelta(days=1)
            day_number += 1
    else:
        days_to_insert = [{"plan_id": plan_id, "day_number": 1}]

    result = supabase.table("plan_days").insert(days_to_insert).execute()
    if not result.data:
        raise ValueError(f"Failed to initialize days for plan {plan_id!r}")
    return result.data


async def list_days_with_items(plan_id: str) -> list[dict]:
    """Return all days for a plan, each with their items embedded, ordered by day_number."""
    supabase = get_supabase_client()
    result = (
        supabase.table("plan_days")
        .select("*, plan_items(*)")
        .eq("plan_id", plan_id)
        .order("day_number")
        .execute()
    )
    days = result.data or []
    for day in days:
        day["items"] = sorted(day.pop("plan_items") or [], key=lambda i: i.get("sort_order") or 0)
    return days


async def create_day(plan_id: str, day_number: int, date_value: str | None = None) -> dict:
    """Insert a new day and return the created row."""
    supabase = get_supabase_client()
    payload: dict = {"plan_id": plan_id, "day_number": day_number}
    if date_value is not None:
        payload["date"] = date_value
    result = supabase.table("plan_days").insert(payload).execute()
    if not result.data:
        raise ValueError(f"Failed to create day for plan {plan_id!r}")
    return {**result.data[0], "items": []}


async def delete_day(day_id: str) -> None:
    """Delete a day by id. Items are cascade-deleted by the FK constraint."""
    supabase = get_supabase_client()
    result = supabase.table("plan_days").delete().eq("id", day_id).execute()
    if not result.data:
        raise ValueError(f"Day {day_id!r} not found")
