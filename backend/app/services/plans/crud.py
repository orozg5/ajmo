import logging
from typing import Literal

from app.db import get_supabase_client
from app.services.plans.days import sync_days

logger = logging.getLogger(__name__)

PlanScope = Literal["owner", "member", "public"]


async def create_plan(data: dict) -> dict:
    """Insert a new plan row and return the created record."""
    supabase = get_supabase_client()
    result = supabase.table("plans").insert(data).execute()
    if not result.data:
        raise ValueError("Failed to create plan")
    return result.data[0]


async def get_plan(plan_id: str) -> dict:
    """Fetch a single plan by id. Raises ValueError if not found."""
    supabase = get_supabase_client()
    result = supabase.table("plans").select("*").eq("id", plan_id).execute()
    if not result.data:
        raise ValueError(f"Plan {plan_id!r} not found")
    return result.data[0]


async def list_user_plans(user_id: str, scope: PlanScope = "owner") -> list[dict]:
    """Return plans for the user filtered by scope.

    - owner: plans where owner_id == user_id.
    - public: plans where visibility='public', excluding ones owned by the user (Discover feed).
    - member: plans the user joined via plan_members (empty until Phase 5 writes membership).

    Each row is augmented with a `destinations` list pulled via a nested select so
    dashboard cards can render chips without N+1 round-trips.
    """
    supabase = get_supabase_client()
    query = (
        supabase.table("plans")
        .select("*, plan_destinations(id, city, country, sort_order)")
        .order("created_at", desc=True)
    )

    if scope == "owner":
        query = query.eq("owner_id", user_id)
    elif scope == "public":
        query = query.eq("visibility", "public").neq("owner_id", user_id)
    elif scope == "member":
        try:
            join = (
                supabase.table("plan_members")
                .select("plan_id")
                .eq("user_id", user_id)
                .execute()
            )
        except Exception:
            logger.info("plan_members table not present yet — returning empty member list")
            return []
        ids = [row["plan_id"] for row in (join.data or [])]
        if not ids:
            return []
        query = query.in_("id", ids)
    else:
        raise ValueError(f"Unknown scope {scope!r}")

    result = query.execute()
    rows = result.data or []
    for row in rows:
        nested = row.pop("plan_destinations", None) or []
        nested.sort(key=lambda item: item.get("sort_order", 0))
        row["destinations"] = nested
    return rows


async def update_plan(plan_id: str, owner_id: str, data: dict) -> dict:
    """Update plan fields for the owner and return the updated record.

    Backend uses the Supabase service_role key, which bypasses the
    "owner writes plan" RLS policy, so we must filter by owner_id here.
    Non-owner requests are indistinguishable from a missing plan
    (both raise ValueError → 404), so we don't leak existence.

    yjs_state is never written from this path — Hocuspocus is the only writer.

    When the patch touches date_from or date_to, plan_days is reconciled
    to the new range first; may raise DateShrinkBlocked if a day with
    items would be dropped.
    """
    data.pop("yjs_state", None)
    supabase = get_supabase_client()

    current_result = (
        supabase.table("plans")
        .select("date_from, date_to")
        .eq("id", plan_id)
        .eq("owner_id", owner_id)
        .execute()
    )
    if not current_result.data:
        raise ValueError(f"Plan {plan_id!r} not found")
    current = current_result.data[0]

    if "date_from" in data or "date_to" in data:
        new_date_from = data["date_from"] if "date_from" in data else current.get("date_from")
        new_date_to = data["date_to"] if "date_to" in data else current.get("date_to")
        await sync_days(plan_id, new_date_from, new_date_to)

    if not data:
        result = supabase.table("plans").select("*").eq("id", plan_id).execute()
        if not result.data:
            raise ValueError(f"Plan {plan_id!r} not found")
        return result.data[0]

    result = (
        supabase.table("plans")
        .update(data)
        .eq("id", plan_id)
        .eq("owner_id", owner_id)
        .execute()
    )
    if not result.data:
        raise ValueError(f"Plan {plan_id!r} not found")
    return result.data[0]


async def delete_plan(plan_id: str, owner_id: str) -> None:
    """Delete a plan by id if owned by owner_id. Raises ValueError otherwise.

    Backend uses the Supabase service_role key, which bypasses RLS, so the
    "owner writes plan" policy does not protect this path. Filtering by
    owner_id here makes a non-owner's request indistinguishable from a
    missing plan (both raise ValueError → 404), so we don't leak existence.
    """
    supabase = get_supabase_client()
    result = (
        supabase.table("plans")
        .delete()
        .eq("id", plan_id)
        .eq("owner_id", owner_id)
        .execute()
    )
    if not result.data:
        raise ValueError(f"Plan {plan_id!r} not found")
