import logging
from datetime import date, timedelta

from app.db import get_supabase_client
from app.services.plans.items import hydrate_item

logger = logging.getLogger(__name__)


class DateShrinkBlocked(ValueError):
    """Raised when changing a plan's date range would drop days that hold items.

    Subclasses ValueError so existing 'except ValueError' paths still see it,
    but route handlers can catch it specifically and translate to 409 Conflict.
    """


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


async def sync_days(
    plan_id: str,
    date_from: date | str | None,
    date_to: date | str | None,
) -> list[dict]:
    """Reconcile plan_days with a new date range.

    - If the new range is open-ended (either bound is None), leave existing
      rows unchanged — open-ended plans use a single undated Day 1 seeded
      by initialize_days, which we don't touch here.
    - Otherwise insert any missing dates, drop any extras that are empty,
      and renumber day_number sequentially in date order starting at 1.
    - Raises DateShrinkBlocked if any day that would be dropped holds items.

    Idempotent on a fully-matching range.
    """
    supabase = get_supabase_client()

    if isinstance(date_from, str):
        date_from = date.fromisoformat(date_from)
    if isinstance(date_to, str):
        date_to = date.fromisoformat(date_to)

    existing_result = (
        supabase.table("plan_days")
        .select("id, day_number, date, plan_items(id)")
        .eq("plan_id", plan_id)
        .execute()
    )
    existing = existing_result.data or []

    if date_from is None or date_to is None:
        return existing

    if date_to < date_from:
        raise ValueError(f"date_to {date_to} precedes date_from {date_from}")

    desired_dates: list[str] = []
    cursor = date_from
    while cursor <= date_to:
        desired_dates.append(cursor.isoformat())
        cursor += timedelta(days=1)
    desired_set = set(desired_dates)

    by_date: dict[str, dict] = {}
    undated: list[dict] = []
    for row in existing:
        if row.get("date"):
            by_date[row["date"]] = row
        else:
            undated.append(row)

    drops_with_items: list[str] = []
    drops_empty: list[dict] = []

    for date_iso, row in by_date.items():
        if date_iso in desired_set:
            continue
        if row.get("plan_items"):
            drops_with_items.append(date_iso)
        else:
            drops_empty.append(row)

    # An undated Day 1 only exists when the plan was open-ended. Switching
    # to a real range replaces it; preserve items by blocking the change.
    for row in undated:
        if row.get("plan_items"):
            drops_with_items.append(f"Day {row['day_number']}")
        else:
            drops_empty.append(row)

    if drops_with_items:
        raise DateShrinkBlocked(
            "Cannot change date range — these days hold items and would be removed: "
            + ", ".join(sorted(drops_with_items))
        )

    drop_ids = [row["id"] for row in drops_empty]
    if drop_ids:
        supabase.table("plan_days").delete().in_("id", drop_ids).execute()

    missing = [d for d in desired_dates if d not in by_date]
    if missing:
        # Insert with placeholder day_numbers above the existing range; the
        # final sort+renumber pass below corrects them. There is no unique
        # constraint on (plan_id, day_number) so collisions are not a concern.
        max_existing = max(
            (row["day_number"] for row in existing if row["id"] not in drop_ids),
            default=0,
        )
        rows_to_insert = [
            {"plan_id": plan_id, "date": iso, "day_number": max_existing + offset + 1}
            for offset, iso in enumerate(missing)
        ]
        supabase.table("plan_days").insert(rows_to_insert).execute()

    fresh_result = (
        supabase.table("plan_days")
        .select("id, day_number, date, title, notes")
        .eq("plan_id", plan_id)
        .order("date")
        .execute()
    )
    fresh = fresh_result.data or []

    for index, row in enumerate(fresh, start=1):
        if row.get("day_number") != index:
            supabase.table("plan_days").update({"day_number": index}).eq(
                "id", row["id"]
            ).execute()
            row["day_number"] = index

    return fresh


async def list_days_with_items(plan_id: str) -> list[dict]:
    """Return all days for a plan, each with their items embedded, ordered by day_number.

    Items carry the joined `places` row hydrated into `ai_data` so map and
    detail UIs always see the freshest stable fields (lat/lng/image_url).
    """
    supabase = get_supabase_client()
    result = (
        supabase.table("plan_days")
        .select("*, plan_items(*, place:places(*))")
        .eq("plan_id", plan_id)
        .order("day_number")
        .execute()
    )
    days = result.data or []
    for day in days:
        raw_items = day.pop("plan_items") or []
        hydrated = [hydrate_item(item) for item in raw_items]
        day["items"] = sorted(
            hydrated,
            key=lambda i: (
                i.get("sort_key") is None,
                i.get("sort_key") or "",
                i.get("sort_order") or 0,
            ),
        )
    return days


async def update_day(day_id: str, payload: dict) -> dict | None:
    """Update title/notes on a day. Returns the fresh row, or None if missing."""
    if not payload:
        return None
    supabase = get_supabase_client()
    result = (
        supabase.table("plan_days")
        .update(payload)
        .eq("id", day_id)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]


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
