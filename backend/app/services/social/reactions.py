"""Plan-item reactions: like / dislike / love / bookmark.

The PK is `(plan_item_id, user_id, kind)` so a user may apply multiple kinds
to the same item but not duplicate a single kind. Add inserts; remove deletes.
The plan-scoped list joins through plan_items so members can see the full
reaction set without N+1 fetches.
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


async def list_plan_reactions(plan_id: str, current_user: str) -> list[dict]:
    """Return every reaction on every item in this plan."""
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
        supabase.table("plan_item_reactions")
        .select("plan_item_id, user_id, kind, created_at")
        .in_("plan_item_id", item_ids)
        .execute()
    )
    return result.data or []


async def add_reaction(
    plan_id: str,
    current_user: str,
    plan_item_id: str,
    kind: str,
) -> dict:
    await assert_plan_member(plan_id, current_user)
    await assert_item_in_plan(plan_id, plan_item_id)

    supabase = get_supabase_client()
    existing = (
        supabase.table("plan_item_reactions")
        .select("plan_item_id, user_id, kind, created_at")
        .eq("plan_item_id", plan_item_id)
        .eq("user_id", current_user)
        .eq("kind", kind)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]

    insert = (
        supabase.table("plan_item_reactions")
        .insert(
            {
                "plan_item_id": plan_item_id,
                "user_id": current_user,
                "kind": kind,
            }
        )
        .execute()
    )
    if not insert.data:
        raise ValueError("Failed to add reaction")

    row = insert.data[0]
    await safe_record_activity(
        plan_id,
        current_user,
        "reaction_added",
        {"plan_item_id": plan_item_id, "kind": kind},
    )
    return row


async def remove_reaction(
    plan_id: str,
    current_user: str,
    plan_item_id: str,
    kind: str,
) -> None:
    await assert_plan_member(plan_id, current_user)
    await assert_item_in_plan(plan_id, plan_item_id)

    supabase = get_supabase_client()
    result = (
        supabase.table("plan_item_reactions")
        .delete()
        .eq("plan_item_id", plan_item_id)
        .eq("user_id", current_user)
        .eq("kind", kind)
        .execute()
    )
    if not result.data:
        raise ValueError("Reaction not found")

    await safe_record_activity(
        plan_id,
        current_user,
        "reaction_removed",
        {"plan_item_id": plan_item_id, "kind": kind},
    )
