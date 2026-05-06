"""Plan-member management — list, change role, remove.

The owner of a plan is stored on `plans.owner_id`, not in `plan_members`. The
list endpoint synthesises an owner row so the UI can show a single combined
roster without a special case for the owner.
"""
from __future__ import annotations

import logging

from app.db import get_supabase_client
from app.services.users.search import get_profile_summary

logger = logging.getLogger(__name__)

ROLE_RANK = {"viewer": 1, "editor": 2, "owner": 3}


async def fetch_plan_owner(plan_id: str) -> str:
    supabase = get_supabase_client()
    result = (
        supabase.table("plans")
        .select("owner_id")
        .eq("id", plan_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise ValueError(f"Plan {plan_id!r} not found")
    return result.data[0]["owner_id"]


async def assert_plan_owner(plan_id: str, user_id: str) -> None:
    owner_id = await fetch_plan_owner(plan_id)
    if owner_id != user_id:
        raise PermissionError("Only the plan owner can perform this action")


async def assert_plan_writer(plan_id: str, user_id: str) -> None:
    """Owner or editor — same gate the Hocuspocus authorize endpoint uses for
    Yjs writes. Routes that mutate plan content (settings, destinations) call
    this so REST and live-edit paths agree on who may write.
    """
    role = await get_role(plan_id, user_id)
    if role not in ("owner", "editor"):
        raise PermissionError("Only the plan owner or editors can perform this action")


async def get_role(plan_id: str, user_id: str) -> str | None:
    """Resolve the user's effective role on the plan, or None if not a member."""
    supabase = get_supabase_client()
    plan_result = (
        supabase.table("plans")
        .select("owner_id, visibility")
        .eq("id", plan_id)
        .limit(1)
        .execute()
    )
    if not plan_result.data:
        return None
    plan = plan_result.data[0]
    if plan["owner_id"] == user_id:
        return "owner"
    member = (
        supabase.table("plan_members")
        .select("role")
        .eq("plan_id", plan_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if member.data:
        return member.data[0]["role"]
    if plan["visibility"] == "public":
        return "viewer"
    return None


async def list_members(plan_id: str) -> list[dict]:
    """Return the membership roster including the owner row.

    The roster is owner → editors → viewers, then by joined_at desc within a
    bucket. Profiles are joined via the FK to keep the response self-contained
    so the frontend doesn't need to make N profile fetches.
    """
    supabase = get_supabase_client()
    members_result = (
        supabase.table("plan_members")
        .select(
            "plan_id, user_id, role, joined_at,"
            " profile:profiles!plan_members_user_id_fkey(id, username, display_name, avatar_url)"
        )
        .eq("plan_id", plan_id)
        .execute()
    )
    rows = members_result.data or []

    owner_id = await fetch_plan_owner(plan_id)
    has_owner_row = any(row["user_id"] == owner_id for row in rows)
    if not has_owner_row:
        owner_profile = await get_profile_summary(owner_id)
        if owner_profile is not None:
            owner_plan = (
                supabase.table("plans")
                .select("created_at")
                .eq("id", plan_id)
                .limit(1)
                .execute()
            )
            joined_at = (owner_plan.data[0]["created_at"] if owner_plan.data else "")
            rows.insert(
                0,
                {
                    "plan_id": plan_id,
                    "user_id": owner_id,
                    "role": "owner",
                    "joined_at": joined_at,
                    "profile": owner_profile,
                },
            )

    rows.sort(
        key=lambda row: (-ROLE_RANK.get(row["role"], 0), row.get("joined_at") or ""),
    )
    return rows


async def update_member_role(
    plan_id: str, current_user: str, target_user_id: str, role: str
) -> dict:
    if role == "owner":
        raise ValueError("Cannot promote a member to owner")
    await assert_plan_owner(plan_id, current_user)
    if target_user_id == current_user:
        raise ValueError("Cannot change the owner's role")

    supabase = get_supabase_client()
    result = (
        supabase.table("plan_members")
        .update({"role": role})
        .eq("plan_id", plan_id)
        .eq("user_id", target_user_id)
        .execute()
    )
    if not result.data:
        raise ValueError("Member not found")

    fetched = (
        supabase.table("plan_members")
        .select(
            "plan_id, user_id, role, joined_at,"
            " profile:profiles!plan_members_user_id_fkey(id, username, display_name, avatar_url)"
        )
        .eq("plan_id", plan_id)
        .eq("user_id", target_user_id)
        .limit(1)
        .execute()
    )
    if not fetched.data:
        raise ValueError("Member not found")
    return fetched.data[0]


async def remove_member(plan_id: str, current_user: str, target_user_id: str) -> None:
    """Remove a member. Owner can remove anyone, members can remove themselves."""
    if target_user_id != current_user:
        await assert_plan_owner(plan_id, current_user)

    owner_id = await fetch_plan_owner(plan_id)
    if target_user_id == owner_id:
        raise ValueError("Cannot remove the plan owner")

    supabase = get_supabase_client()
    result = (
        supabase.table("plan_members")
        .delete()
        .eq("plan_id", plan_id)
        .eq("user_id", target_user_id)
        .execute()
    )
    if not result.data:
        raise ValueError("Member not found")


async def upsert_member(plan_id: str, user_id: str, role: str) -> str:
    """Add or upgrade a member's role; never downgrade.

    Returns the resulting role (which may be the existing higher role).
    """
    supabase = get_supabase_client()
    existing = (
        supabase.table("plan_members")
        .select("role")
        .eq("plan_id", plan_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        current_role = existing.data[0]["role"]
        if ROLE_RANK[current_role] >= ROLE_RANK[role]:
            return current_role
        update_result = (
            supabase.table("plan_members")
            .update({"role": role})
            .eq("plan_id", plan_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not update_result.data:
            raise ValueError("Failed to update member role")
        return role

    insert_result = (
        supabase.table("plan_members")
        .insert({"plan_id": plan_id, "user_id": user_id, "role": role})
        .execute()
    )
    if not insert_result.data:
        raise ValueError("Failed to insert member")
    return role


async def add_member_by_owner(
    plan_id: str, current_user: str, target_user_id: str, role: str
) -> dict:
    """Owner adds a friend (or any user) directly to the plan, then returns
    the membership row with the joined profile so the UI can render without a
    second fetch."""
    if role == "owner":
        raise ValueError("Cannot add another owner")
    await assert_plan_owner(plan_id, current_user)
    if target_user_id == current_user:
        raise ValueError("You're already on this plan as the owner")

    supabase = get_supabase_client()
    profile_check = (
        supabase.table("profiles")
        .select("id")
        .eq("id", target_user_id)
        .limit(1)
        .execute()
    )
    if not profile_check.data:
        raise ValueError("User not found")

    await upsert_member(plan_id, target_user_id, role)

    fetched = (
        supabase.table("plan_members")
        .select(
            "plan_id, user_id, role, joined_at,"
            " profile:profiles!plan_members_user_id_fkey(id, username, display_name, avatar_url)"
        )
        .eq("plan_id", plan_id)
        .eq("user_id", target_user_id)
        .limit(1)
        .execute()
    )
    if not fetched.data:
        raise ValueError("Failed to fetch member after upsert")
    return fetched.data[0]
