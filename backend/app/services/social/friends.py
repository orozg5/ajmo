"""Friendship CRUD: send / accept / reject / unfriend, plus list views.

Backend uses the Supabase service_role key, which bypasses RLS. All queries
here are explicitly scoped by the current user's UUID so non-participants
can never read or mutate someone else's friendship row.
"""
from __future__ import annotations

import logging

from app.db import get_supabase_client
from app.services.users.search import get_profile_by_username

logger = logging.getLogger(__name__)

FRIENDSHIP_SELECT = (
    "id, requester_id, addressee_id, status, created_at,"
    " requester:profiles!friendships_requester_id_fkey(id, username, display_name, avatar_url),"
    " addressee:profiles!friendships_addressee_id_fkey(id, username, display_name, avatar_url)"
)


def attach_other(row: dict, current_user: str) -> dict:
    """Collapse the two embedded profiles into a single `other` field.

    The friendships row carries both endpoints; the frontend only cares about
    the *other* party from the current user's perspective.
    """
    requester = row.pop("requester", None) or {}
    addressee = row.pop("addressee", None) or {}
    row["other"] = addressee if row["requester_id"] == current_user else requester
    return row


async def list_accepted(current_user: str) -> list[dict]:
    supabase = get_supabase_client()
    result = (
        supabase.table("friendships")
        .select(FRIENDSHIP_SELECT)
        .eq("status", "accepted")
        .or_(f"requester_id.eq.{current_user},addressee_id.eq.{current_user}")
        .order("created_at", desc=True)
        .execute()
    )
    return [attach_other(row, current_user) for row in (result.data or [])]


async def list_incoming(current_user: str) -> list[dict]:
    supabase = get_supabase_client()
    result = (
        supabase.table("friendships")
        .select(FRIENDSHIP_SELECT)
        .eq("status", "pending")
        .eq("addressee_id", current_user)
        .order("created_at", desc=True)
        .execute()
    )
    return [attach_other(row, current_user) for row in (result.data or [])]


async def list_outgoing(current_user: str) -> list[dict]:
    supabase = get_supabase_client()
    result = (
        supabase.table("friendships")
        .select(FRIENDSHIP_SELECT)
        .eq("status", "pending")
        .eq("requester_id", current_user)
        .order("created_at", desc=True)
        .execute()
    )
    return [attach_other(row, current_user) for row in (result.data or [])]


async def send_request(current_user: str, addressee_username: str) -> dict:
    """Create a pending friendship row from the current user to a username.

    Raises ValueError on: self-request, unknown username, or an existing edge
    in either direction (the unique constraint catches forward dupes; we check
    the reverse direction explicitly so a previously rejected/inverted edge
    doesn't slip through).
    """
    addressee = await get_profile_by_username(addressee_username)
    if addressee is None:
        raise ValueError(f"User {addressee_username!r} not found")
    addressee_id = addressee["id"]
    if addressee_id == current_user:
        raise ValueError("Cannot friend yourself")

    supabase = get_supabase_client()
    existing = (
        supabase.table("friendships")
        .select("id, requester_id, addressee_id, status")
        .or_(
            f"and(requester_id.eq.{current_user},addressee_id.eq.{addressee_id}),"
            f"and(requester_id.eq.{addressee_id},addressee_id.eq.{current_user})"
        )
        .limit(1)
        .execute()
    )
    if existing.data:
        existing_row = existing.data[0]
        if existing_row["status"] == "accepted":
            raise ValueError("Already friends")
        raise ValueError("Friend request already exists")

    insert = (
        supabase.table("friendships")
        .insert(
            {
                "requester_id": current_user,
                "addressee_id": addressee_id,
                "status": "pending",
            }
        )
        .execute()
    )
    if not insert.data:
        raise ValueError("Failed to create friend request")

    fetched = (
        supabase.table("friendships")
        .select(FRIENDSHIP_SELECT)
        .eq("id", insert.data[0]["id"])
        .limit(1)
        .execute()
    )
    if not fetched.data:
        raise ValueError("Failed to fetch new friend request")
    return attach_other(fetched.data[0], current_user)


async def respond_to_request(current_user: str, request_id: str, accept: bool) -> dict:
    """Accept or reject a pending request addressed to the current user."""
    new_status = "accepted" if accept else "rejected"
    supabase = get_supabase_client()
    result = (
        supabase.table("friendships")
        .update({"status": new_status})
        .eq("id", request_id)
        .eq("addressee_id", current_user)
        .eq("status", "pending")
        .execute()
    )
    if not result.data:
        raise ValueError(f"Friend request {request_id!r} not found")

    fetched = (
        supabase.table("friendships")
        .select(FRIENDSHIP_SELECT)
        .eq("id", request_id)
        .limit(1)
        .execute()
    )
    if not fetched.data:
        raise ValueError(f"Friend request {request_id!r} not found")
    return attach_other(fetched.data[0], current_user)


async def cancel_outgoing(current_user: str, request_id: str) -> None:
    """Remove a pending request the current user originally sent."""
    supabase = get_supabase_client()
    result = (
        supabase.table("friendships")
        .delete()
        .eq("id", request_id)
        .eq("requester_id", current_user)
        .eq("status", "pending")
        .execute()
    )
    if not result.data:
        raise ValueError(f"Friend request {request_id!r} not found")


async def remove_friend(current_user: str, other_user_id: str) -> None:
    """Delete the friendship row regardless of which side initiated it."""
    supabase = get_supabase_client()
    result = (
        supabase.table("friendships")
        .delete()
        .or_(
            f"and(requester_id.eq.{current_user},addressee_id.eq.{other_user_id}),"
            f"and(requester_id.eq.{other_user_id},addressee_id.eq.{current_user})"
        )
        .execute()
    )
    if not result.data:
        raise ValueError(f"Friendship with {other_user_id!r} not found")
