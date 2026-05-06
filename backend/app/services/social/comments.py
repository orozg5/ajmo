"""Plan comments: list / create / update (own) / soft-delete (own or owner).

Threaded one level deep — the schema permits arbitrary nesting via `parent_id`
but the UI flattens any descendants under their root. Soft delete sets
`deleted_at` instead of deleting the row so reply chains stay intact.

RLS already enforces member-read and self-write at the database, but we still
gate at the service layer so a non-member's call returns 403/404 with a clean
error path instead of relying on RLS to silently zero-row.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.db import get_supabase_client
from app.services.social.activity import safe_record_activity
from app.services.social.members import fetch_plan_owner, get_role

logger = logging.getLogger(__name__)

COMMENT_SELECT = (
    "id, plan_id, plan_item_id, parent_id, author_id, body,"
    " created_at, updated_at, deleted_at,"
    " author:profiles!plan_comments_author_id_fkey(id, username, display_name, avatar_url)"
)


async def assert_plan_member(plan_id: str, user_id: str) -> None:
    role = await get_role(plan_id, user_id)
    if role is None:
        raise PermissionError("Not a member of this plan")


async def list_comments(
    plan_id: str,
    current_user: str,
    plan_item_id: str | None = None,
) -> list[dict]:
    await assert_plan_member(plan_id, current_user)
    supabase = get_supabase_client()
    query = (
        supabase.table("plan_comments")
        .select(COMMENT_SELECT)
        .eq("plan_id", plan_id)
        .order("created_at", desc=False)
    )
    if plan_item_id is not None:
        query = query.eq("plan_item_id", plan_item_id)
    result = query.execute()
    return result.data or []


async def create_comment(
    plan_id: str,
    current_user: str,
    body: str,
    plan_item_id: str | None,
    parent_id: str | None,
) -> dict:
    await assert_plan_member(plan_id, current_user)

    if parent_id is not None:
        supabase = get_supabase_client()
        parent = (
            supabase.table("plan_comments")
            .select("id, plan_id, parent_id")
            .eq("id", parent_id)
            .limit(1)
            .execute()
        )
        if not parent.data:
            raise ValueError("Parent comment not found")
        if parent.data[0]["plan_id"] != plan_id:
            raise ValueError("Parent comment belongs to a different plan")

    supabase = get_supabase_client()
    insert = (
        supabase.table("plan_comments")
        .insert(
            {
                "plan_id": plan_id,
                "plan_item_id": plan_item_id,
                "parent_id": parent_id,
                "author_id": current_user,
                "body": body,
            }
        )
        .execute()
    )
    if not insert.data:
        raise ValueError("Failed to create comment")

    fetched = (
        supabase.table("plan_comments")
        .select(COMMENT_SELECT)
        .eq("id", insert.data[0]["id"])
        .limit(1)
        .execute()
    )
    if not fetched.data:
        raise ValueError("Failed to fetch new comment")
    row = fetched.data[0]

    body_preview = body[:120]
    await safe_record_activity(
        plan_id,
        current_user,
        "comment_posted",
        {
            "comment_id": row["id"],
            "plan_item_id": plan_item_id,
            "body_preview": body_preview,
        },
    )
    return row


async def update_comment(
    plan_id: str,
    current_user: str,
    comment_id: str,
    body: str,
) -> dict:
    supabase = get_supabase_client()
    existing = (
        supabase.table("plan_comments")
        .select("id, plan_id, author_id, deleted_at")
        .eq("id", comment_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise ValueError("Comment not found")
    row = existing.data[0]
    if row["plan_id"] != plan_id:
        raise ValueError("Comment not found")
    if row["deleted_at"] is not None:
        raise ValueError("Comment was deleted")
    if row["author_id"] != current_user:
        raise PermissionError("Only the author can edit a comment")

    update = (
        supabase.table("plan_comments")
        .update({"body": body})
        .eq("id", comment_id)
        .execute()
    )
    if not update.data:
        raise ValueError("Failed to update comment")

    fetched = (
        supabase.table("plan_comments")
        .select(COMMENT_SELECT)
        .eq("id", comment_id)
        .limit(1)
        .execute()
    )
    if not fetched.data:
        raise ValueError("Failed to fetch updated comment")
    return fetched.data[0]


async def delete_comment(plan_id: str, current_user: str, comment_id: str) -> None:
    """Soft-delete: author or plan owner can mark deleted_at."""
    supabase = get_supabase_client()
    existing = (
        supabase.table("plan_comments")
        .select("id, plan_id, author_id, deleted_at")
        .eq("id", comment_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise ValueError("Comment not found")
    row = existing.data[0]
    if row["plan_id"] != plan_id:
        raise ValueError("Comment not found")
    if row["deleted_at"] is not None:
        return

    is_author = row["author_id"] == current_user
    is_owner = False
    if not is_author:
        owner_id = await fetch_plan_owner(plan_id)
        is_owner = owner_id == current_user
    if not (is_author or is_owner):
        raise PermissionError("Only the author or the plan owner can delete this comment")

    now_iso = datetime.now(timezone.utc).isoformat()
    update = (
        supabase.table("plan_comments")
        .update({"deleted_at": now_iso, "body": ""})
        .eq("id", comment_id)
        .execute()
    )
    if not update.data:
        raise ValueError("Failed to delete comment")
