"""Profile CRUD (display_name, avatar_url, bio) on the `profiles` table."""
import logging

from app.db import get_supabase_client

logger = logging.getLogger(__name__)


async def get_profile(user_id: str) -> dict | None:
    supabase = get_supabase_client()
    result = (
        supabase.table("profiles")
        .select("id, username, display_name, avatar_url, bio")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]


async def update_profile(user_id: str, payload: dict) -> dict:
    """Update mutable profile fields. Never touches `id` or `username`."""
    supabase = get_supabase_client()
    data = {k: v for k, v in payload.items() if k in {"display_name", "avatar_url", "bio"}}
    if not data:
        existing = await get_profile(user_id)
        if existing is None:
            raise ValueError(f"Profile {user_id!r} not found")
        return existing

    result = (
        supabase.table("profiles")
        .update(data)
        .eq("id", user_id)
        .execute()
    )
    if not result.data:
        raise ValueError(f"Profile {user_id!r} not found")
    return result.data[0]
