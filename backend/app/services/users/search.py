"""Profile lookup helpers used by the friend-finder UI."""
from __future__ import annotations

import logging

from app.db import get_supabase_client

logger = logging.getLogger(__name__)

PROFILE_FIELDS = "id, username, display_name, avatar_url"


async def search_profiles(query: str, exclude_user_id: str, limit: int = 10) -> list[dict]:
    """Return profiles whose username or display_name matches `query` (ILIKE)."""
    needle = query.strip()
    if not needle:
        return []
    supabase = get_supabase_client()
    pattern = f"%{needle}%"
    result = (
        supabase.table("profiles")
        .select(PROFILE_FIELDS)
        .or_(f"username.ilike.{pattern},display_name.ilike.{pattern}")
        .neq("id", exclude_user_id)
        .limit(limit)
        .execute()
    )
    return result.data or []


async def get_profile_by_username(username: str) -> dict | None:
    supabase = get_supabase_client()
    result = (
        supabase.table("profiles")
        .select(PROFILE_FIELDS)
        .eq("username", username)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]


async def get_profile_summary(user_id: str) -> dict | None:
    supabase = get_supabase_client()
    result = (
        supabase.table("profiles")
        .select(PROFILE_FIELDS)
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]
