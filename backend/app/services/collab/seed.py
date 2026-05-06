"""Build a fresh Y.Doc from relational state for cold-loading a collab room.

When Hocuspocus opens a plan whose `plans.yjs_state` is NULL, it asks the
backend for a seed update. We rebuild the doc from the canonical relational
tables so the user sees the existing itinerary the first time anyone joins.
Only the three keys defined in `schema.py` are seeded — days/destinations are
fetched separately by the frontend via REST and aren't part of the Y.Doc.
"""
from __future__ import annotations

import base64
import logging

from pycrdt import Array, Doc, Map

from app.db import get_supabase_client
from app.services.collab.schema import (
    ITEM_FIELDS,
    ROOT_DAY_NOTES,
    ROOT_ITEMS,
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

    return doc.get_update()


async def build_seed_update_b64(plan_id: str) -> str:
    update = await build_seed_update(plan_id)
    return base64.b64encode(update).decode("ascii")
