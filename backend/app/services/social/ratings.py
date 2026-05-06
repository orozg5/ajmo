"""Plan-item ratings: 1-5 stars per (item, user).

PK is `(plan_item_id, user_id)` so each user has at most one rating per item.
Setting stars is an upsert; deleting clears the row. The frontend computes
`avg(stars)` and `count(*)` per item from the full list returned by
`list_plan_ratings`.
"""
from __future__ import annotations

import logging

from app.db import get_supabase_client
from app.services.social.activity import safe_record_activity
from app.services.social.members import get_role

logger = logging.getLogger(__name__)


async def assert_plan_member(plan_id: str, user_id: str) -> None:
    role = await get_role(plan_id, user_id)
    if role is None:
        raise PermissionError("Not a member of this plan")


async def assert_item_in_plan(plan_id: str, plan_item_id: str) -> None:
    supabase = get_supabase_client()
    item = (
        supabase.table("plan_items")
        .select("id, plan_id")
        .eq("id", plan_item_id)
        .limit(1)
        .execute()
    )
    if not item.data:
        raise ValueError("Plan item not found")
    if item.data[0]["plan_id"] != plan_id:
        raise ValueError("Plan item does not belong to this plan")


async def list_plan_ratings(plan_id: str, current_user: str) -> list[dict]:
    await assert_plan_member(plan_id, current_user)
    supabase = get_supabase_client()
    items = (
        supabase.table("plan_items")
        .select("id")
        .eq("plan_id", plan_id)
        .execute()
    )
    item_ids = [row["id"] for row in (items.data or [])]
    if not item_ids:
        return []
    result = (
        supabase.table("plan_item_ratings")
        .select("plan_item_id, user_id, stars, created_at, updated_at")
        .in_("plan_item_id", item_ids)
        .execute()
    )
    return result.data or []


async def upsert_rating(
    plan_id: str,
    current_user: str,
    plan_item_id: str,
    stars: int,
) -> dict:
    if stars < 1 or stars > 5:
        raise ValueError("Stars must be between 1 and 5")
    await assert_plan_member(plan_id, current_user)
    await assert_item_in_plan(plan_id, plan_item_id)

    supabase = get_supabase_client()
    result = (
        supabase.table("plan_item_ratings")
        .upsert(
            {
                "plan_item_id": plan_item_id,
                "user_id": current_user,
                "stars": stars,
            },
            on_conflict="plan_item_id,user_id",
        )
        .execute()
    )
    if not result.data:
        raise ValueError("Failed to upsert rating")

    fetched = (
        supabase.table("plan_item_ratings")
        .select("plan_item_id, user_id, stars, created_at, updated_at")
        .eq("plan_item_id", plan_item_id)
        .eq("user_id", current_user)
        .limit(1)
        .execute()
    )
    if not fetched.data:
        raise ValueError("Failed to fetch rating after upsert")

    await safe_record_activity(
        plan_id,
        current_user,
        "rating_set",
        {"plan_item_id": plan_item_id, "stars": stars},
    )
    return fetched.data[0]


async def delete_rating(
    plan_id: str,
    current_user: str,
    plan_item_id: str,
) -> None:
    await assert_plan_member(plan_id, current_user)
    await assert_item_in_plan(plan_id, plan_item_id)

    supabase = get_supabase_client()
    result = (
        supabase.table("plan_item_ratings")
        .delete()
        .eq("plan_item_id", plan_item_id)
        .eq("user_id", current_user)
        .execute()
    )
    if not result.data:
        raise ValueError("Rating not found")

    await safe_record_activity(
        plan_id,
        current_user,
        "rating_cleared",
        {"plan_item_id": plan_item_id},
    )
