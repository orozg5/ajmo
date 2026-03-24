import logging

from app.db import get_supabase_client

logger = logging.getLogger(__name__)


# ── Service functions ─────────────────────────────────────────────────────────


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


async def list_user_plans(owner_id: str) -> list[dict]:
    """Return all plans owned by the given user, newest first."""
    supabase = get_supabase_client()
    result = (
        supabase.table("plans")
        .select("*")
        .eq("owner_id", owner_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


async def update_plan(plan_id: str, data: dict) -> dict:
    """Update plan fields (excluding yjs_state) and return the updated record."""
    # Safety guard — yjs_state is managed exclusively by y-websocket
    data.pop("yjs_state", None)
    supabase = get_supabase_client()
    result = supabase.table("plans").update(data).eq("id", plan_id).execute()
    if not result.data:
        raise ValueError(f"Plan {plan_id!r} not found")
    return result.data[0]


async def delete_plan(plan_id: str) -> None:
    """Delete a plan by id. Raises ValueError if the plan did not exist."""
    supabase = get_supabase_client()
    result = supabase.table("plans").delete().eq("id", plan_id).execute()
    if not result.data:
        raise ValueError(f"Plan {plan_id!r} not found")
