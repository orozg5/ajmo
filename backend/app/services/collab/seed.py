"""Build a fresh Y.Doc from relational state for cold-loading a collab room.

When Hocuspocus opens a plan whose `plans.yjs_state` is NULL, it asks the
backend for a seed update. We rebuild the doc from the canonical relational
tables so the user sees the existing itinerary the first time anyone joins.
The keys seeded mirror `schema.py`: items, day_notes, likes, ratings,
comments. Days/destinations are fetched separately by the frontend via REST
and aren't part of the Y.Doc.
"""
from __future__ import annotations

import base64
import logging

from pycrdt import Array, Doc, Map

from app.db import get_supabase_client
from app.services.collab.schema import (
    COMMENT_FIELDS,
    ITEM_FIELDS,
    ROOT_COMMENTS,
    ROOT_DAY_NOTES,
    ROOT_ITEMS,
    ROOT_LIKES,
    ROOT_RATINGS,
)

logger = logging.getLogger(__name__)


def project_row(row: dict, fields: tuple[str, ...]) -> dict:
    return {field: row.get(field) for field in fields}


async def build_seed_update(plan_id: str) -> bytes:
    supabase = get_supabase_client()

    items_q = (
        supabase.table("plan_items")
        .select(", ".join(ITEM_FIELDS))
        .eq("plan_id", plan_id)
        .order("sort_key")
        .execute()
    )
    items_by_day: dict[str, list[dict]] = {}
    for row in items_q.data or []:
        items_by_day.setdefault(row["day_id"], []).append(row)

    days_q = (
        supabase.table("plan_days")
        .select("id, notes")
        .eq("plan_id", plan_id)
        .execute()
    )
    day_notes = {
        row["id"]: row["notes"] or ""
        for row in (days_q.data or [])
        if row.get("notes")
    }

    item_ids: list[str] = []
    for rows in items_by_day.values():
        for row in rows:
            if row.get("id"):
                item_ids.append(row["id"])

    likes_by_item: dict[str, set[str]] = {}
    ratings_by_item: dict[str, dict[str, int]] = {}
    if item_ids:
        likes_q = (
            supabase.table("plan_item_reactions")
            .select("plan_item_id, user_id")
            .eq("kind", "like")
            .in_("plan_item_id", item_ids)
            .execute()
        )
        for row in likes_q.data or []:
            likes_by_item.setdefault(row["plan_item_id"], set()).add(row["user_id"])

        ratings_q = (
            supabase.table("plan_item_ratings")
            .select("plan_item_id, user_id, stars")
            .in_("plan_item_id", item_ids)
            .execute()
        )
        for row in ratings_q.data or []:
            ratings_by_item.setdefault(row["plan_item_id"], {})[row["user_id"]] = row[
                "stars"
            ]

    comments_q = (
        supabase.table("plan_comments")
        .select(", ".join(COMMENT_FIELDS) + ", plan_id")
        .eq("plan_id", plan_id)
        .order("created_at")
        .execute()
    )
    comment_rows = [
        {field: row.get(field) for field in COMMENT_FIELDS}
        for row in (comments_q.data or [])
        if row.get("id")
    ]

    doc = Doc()
    items_root = doc.get(ROOT_ITEMS, type=Map)
    for day_id, item_rows in items_by_day.items():
        arr = Array()
        items_root[day_id] = arr
        for row in item_rows:
            arr.append(Map(project_row(row, ITEM_FIELDS)))

    notes_root = doc.get(ROOT_DAY_NOTES, type=Map)
    for day_id, notes in day_notes.items():
        notes_root[day_id] = notes

    likes_root = doc.get(ROOT_LIKES, type=Map)
    for item_id, user_ids in likes_by_item.items():
        inner = Map()
        likes_root[item_id] = inner
        for user_id in user_ids:
            inner[user_id] = True

    ratings_root = doc.get(ROOT_RATINGS, type=Map)
    for item_id, by_user in ratings_by_item.items():
        inner = Map()
        ratings_root[item_id] = inner
        for user_id, stars in by_user.items():
            inner[user_id] = int(stars)

    comments_root = doc.get(ROOT_COMMENTS, type=Array)
    for row in comment_rows:
        comments_root.append(Map(row))

    return doc.get_update()


async def build_seed_update_b64(plan_id: str) -> str:
    update = await build_seed_update(plan_id)
    return base64.b64encode(update).decode("ascii")
