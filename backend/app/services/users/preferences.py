import logging

from app.db import get_supabase_client

logger = logging.getLogger(__name__)


async def get_preferences(user_id: str) -> dict | None:
    supabase = get_supabase_client()
    result = (
        supabase.table("user_preferences")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]


async def upsert_preferences(user_id: str, payload: dict) -> dict:
    supabase = get_supabase_client()
    data = {"user_id": user_id, **payload}
    result = (
        supabase.table("user_preferences")
        .upsert(data, on_conflict="user_id")
        .execute()
    )
    if not result.data:
        raise ValueError(f"Failed to upsert preferences for user {user_id!r}")
    return result.data[0]
