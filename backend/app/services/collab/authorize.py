"""Decode a Supabase JWT and resolve the connecting user's role on a plan.

Called from the collab service when a websocket client connects. Returns the
role string ('owner' | 'editor' | 'viewer') or raises PermissionError when the
user has no read access to the plan.
"""
from __future__ import annotations

import logging

import jwt

from app.auth import jwks_client
from app.db import get_supabase_client
from app.services.social.members import get_role

logger = logging.getLogger(__name__)


def decode_token(token: str) -> str:
    payload = jwt.decode(
        token,
        jwks_client.get_signing_key_from_jwt(token).key,
        algorithms=["ES256", "RS256", "HS256"],
        audience="authenticated",
        leeway=10,
    )
    user_id = payload.get("sub")
    if not user_id:
        raise PermissionError("Token has no sub claim")
    return user_id


async def resolve_role(token: str, plan_id: str) -> tuple[str, str]:
    """Validate the JWT and return (user_id, role) for the plan.

    Raises PermissionError if the token is invalid or the user has no role on
    the plan. A 'viewer' role is granted automatically for public plans.
    """
    try:
        user_id = decode_token(token)
    except jwt.InvalidTokenError as exc:
        raise PermissionError(f"Invalid token: {exc}") from exc

    supabase = get_supabase_client()
    plan_result = (
        supabase.table("plans")
        .select("id")
        .eq("id", plan_id)
        .limit(1)
        .execute()
    )
    if not plan_result.data:
        raise PermissionError(f"Plan {plan_id!r} not found")

    role = await get_role(plan_id, user_id)
    if role is None:
        raise PermissionError(f"User {user_id} has no role on plan {plan_id}")
    return user_id, role
