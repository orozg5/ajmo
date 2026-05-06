"""Plan activity feed: append-only event log.

Writes flow through `record_activity()` from other social services so the feed
captures comment/reaction/rating/member events without mixing concerns. Reads
are paged in reverse chronological order.

Activity is a side-channel — failures here must never bubble out and break the
parent operation. Every caller wraps `record_activity` in try/except. The
`safe_record_activity` helper does this for them.
"""
from __future__ import annotations

import logging
from typing import Any

from app.db import get_supabase_client

logger = logging.getLogger(__name__)

ACTIVITY_SELECT = (
    "id, plan_id, actor_id, kind, payload, created_at,"
    " actor:profiles!plan_activity_actor_id_fkey(id, username, display_name, avatar_url)"
)


async def record_activity(
    plan_id: str,
    actor_id: str | None,
    kind: str,
    payload: dict[str, Any] | None = None,
) -> dict | None:
    """Insert a single activity row. Returns the inserted row or None on failure."""
    supabase = get_supabase_client()
    insert = (
        supabase.table("plan_activity")
        .insert(
            {
                "plan_id": plan_id,
                "actor_id": actor_id,
                "kind": kind,
                "payload": payload or {},
            }
        )
        .execute()
    )
    if not insert.data:
        return None
    return insert.data[0]


async def safe_record_activity(
    plan_id: str,
    actor_id: str | None,
    kind: str,
    payload: dict[str, Any] | None = None,
) -> None:
    """Best-effort activity write — swallow + log any error."""
    try:
        await record_activity(plan_id, actor_id, kind, payload)
    except Exception:
        logger.exception(
            "Failed to record activity %s for plan %s by %s", kind, plan_id, actor_id
        )


async def list_activity(
    plan_id: str,
    limit: int = 50,
    before: str | None = None,
) -> list[dict]:
    """Return activity rows for a plan, newest first.

    `before` is an ISO timestamp; rows with `created_at < before` are returned
    so the client can page back from any point.
    """
    supabase = get_supabase_client()
    query = (
        supabase.table("plan_activity")
        .select(ACTIVITY_SELECT)
        .eq("plan_id", plan_id)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if before:
        query = query.lt("created_at", before)
    result = query.execute()
    return result.data or []
