"""Plan invite tokens: generate, list, revoke, redeem.

The redemption path is the only one available without owner privilege. Every
other endpoint requires the plan owner.
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from app.db import get_supabase_client
from app.services.social.members import (
    assert_plan_owner,
    fetch_plan_owner,
    upsert_member,
)

logger = logging.getLogger(__name__)


async def list_invites(plan_id: str, current_user: str) -> list[dict]:
    await assert_plan_owner(plan_id, current_user)
    supabase = get_supabase_client()
    result = (
        supabase.table("plan_invites")
        .select(
            "id, plan_id, token, role, expires_at, max_uses, uses, created_by, created_at"
        )
        .eq("plan_id", plan_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


async def create_invite(
    plan_id: str,
    current_user: str,
    role: str,
    expires_in_hours: int | None,
    max_uses: int | None,
) -> dict:
    await assert_plan_owner(plan_id, current_user)
    if role == "owner":
        raise ValueError("Cannot create an owner invite")

    expires_at: str | None = None
    if expires_in_hours is not None:
        expires_at = (
            datetime.now(tz=timezone.utc) + timedelta(hours=expires_in_hours)
        ).isoformat()

    supabase = get_supabase_client()
    insert = (
        supabase.table("plan_invites")
        .insert(
            {
                "plan_id": plan_id,
                "token": secrets.token_urlsafe(32),
                "role": role,
                "expires_at": expires_at,
                "max_uses": max_uses,
                "uses": 0,
                "created_by": current_user,
            }
        )
        .execute()
    )
    if not insert.data:
        raise ValueError("Failed to create invite")
    return insert.data[0]


async def revoke_invite(plan_id: str, invite_id: str, current_user: str) -> None:
    await assert_plan_owner(plan_id, current_user)
    supabase = get_supabase_client()
    result = (
        supabase.table("plan_invites")
        .delete()
        .eq("id", invite_id)
        .eq("plan_id", plan_id)
        .execute()
    )
    if not result.data:
        raise ValueError(f"Invite {invite_id!r} not found")


async def accept_invite(token: str, current_user: str) -> dict:
    """Redeem an invite token: bump uses, upsert plan_members, return target.

    Raises ValueError if the token is missing, expired, or exhausted. Owners
    redeeming their own plan's link are a no-op (returns 'owner' immediately).
    """
    supabase = get_supabase_client()
    result = (
        supabase.table("plan_invites")
        .select("id, plan_id, role, expires_at, max_uses, uses")
        .eq("token", token)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise ValueError("Invite not found")
    invite = result.data[0]

    if invite["expires_at"] is not None:
        expires_at = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
        if expires_at < datetime.now(tz=timezone.utc):
            raise ValueError("Invite has expired")

    if invite["max_uses"] is not None and invite["uses"] >= invite["max_uses"]:
        raise ValueError("Invite has reached its maximum uses")

    plan_id = invite["plan_id"]
    owner_id = await fetch_plan_owner(plan_id)
    if owner_id == current_user:
        return {"plan_id": plan_id, "role": "owner"}

    final_role = await upsert_member(plan_id, current_user, invite["role"])

    supabase.table("plan_invites").update({"uses": invite["uses"] + 1}).eq(
        "id", invite["id"]
    ).execute()

    return {"plan_id": plan_id, "role": final_role}
