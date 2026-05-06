"""Debounced Yjs → relational materializer.

Hocuspocus calls /internal/collab/changed on every Yjs `onChange`. We coalesce
those signals into a per-plan asyncio.Task that fires after `YJS_IDLE_MS` of
silence. When it fires we read `plans.yjs_state`, decode the binary Y.Doc,
and reconcile the three live-edited tables to match.

We intentionally do not run inside a single Postgres transaction — supabase-py
issues each table call as its own REST request. We order writes so foreign-key
constraints are always satisfied:

  1. upsert items
  2. update day notes
  3. delete items that disappeared from the doc
"""
from __future__ import annotations

import asyncio
import logging

from pycrdt import Array, Doc, Map

from app.config import settings
from app.db import get_supabase_client
from app.services.collab.schema import (
    ITEM_FIELDS,
    ROOT_DAY_NOTES,
    ROOT_ITEMS,
)

logger = logging.getLogger(__name__)

pending: dict[str, asyncio.Task] = {}


def schedule(plan_id: str) -> None:
    existing = pending.get(plan_id)
    if existing is not None and not existing.done():
        existing.cancel()
    pending[plan_id] = asyncio.create_task(run_after_idle(plan_id))


async def run_after_idle(plan_id: str) -> None:
    try:
        await asyncio.sleep(settings.YJS_IDLE_MS / 1000)
        await materialize(plan_id)
    except asyncio.CancelledError:
        return
    except Exception:
        logger.exception("Materializer failed for plan %s", plan_id)
    finally:
        if pending.get(plan_id) is asyncio.current_task():
            pending.pop(plan_id, None)


async def materialize(plan_id: str) -> None:
    supabase = get_supabase_client()
    state_result = (
        supabase.table("plans")
        .select("yjs_state")
        .eq("id", plan_id)
        .limit(1)
        .execute()
    )
    if not state_result.data:
        logger.warning("Materializer: plan %s missing", plan_id)
        return
    raw_state = state_result.data[0].get("yjs_state")
    if not raw_state:
        logger.info("Materializer: plan %s has no yjs_state yet", plan_id)
        return

    state_bytes = decode_state_blob(raw_state)
    doc = Doc()
    doc.apply_update(state_bytes)

    item_rows = read_items(doc, plan_id)
    day_notes = read_day_notes(doc)

    await reconcile_items(plan_id, item_rows)
    await reconcile_day_notes(plan_id, day_notes)


def decode_state_blob(raw: bytes | str | memoryview) -> bytes:
    """Supabase returns BYTEA columns either as raw bytes or as a hex string
    prefixed with `\\x` depending on the client version. Normalise both."""
    if isinstance(raw, bytes):
        return raw
    if isinstance(raw, memoryview):
        return bytes(raw)
    if isinstance(raw, str):
        if raw.startswith("\\x"):
            return bytes.fromhex(raw[2:])
        return bytes.fromhex(raw)
    raise TypeError(f"Unexpected yjs_state type: {type(raw)!r}")


def map_to_dict(value: Map) -> dict:
    return {key: value[key] for key in value.keys()}


def read_items(doc: Doc, plan_id: str) -> list[dict]:
    items_root = doc.get(ROOT_ITEMS, type=Map)
    rows: list[dict] = []
    for day_id in items_root.keys():
        arr = items_root[day_id]
        if not isinstance(arr, Array):
            continue
        for entry in arr:
            if not isinstance(entry, Map):
                continue
            snapshot = map_to_dict(entry)
            row = {field: snapshot.get(field) for field in ITEM_FIELDS}
            row["plan_id"] = plan_id
            row["day_id"] = day_id
            rows.append(row)
    return rows


def read_day_notes(doc: Doc) -> dict[str, str]:
    raw = doc.get(ROOT_DAY_NOTES, type=Map)
    out: dict[str, str] = {}
    for day_id in raw.keys():
        value = raw[day_id]
        if value is None:
            continue
        out[day_id] = str(value)
    return out


async def reconcile_items(plan_id: str, target_rows: list[dict]) -> None:
    supabase = get_supabase_client()
    target_ids = {row["id"] for row in target_rows if row.get("id")}
    existing = (
        supabase.table("plan_items")
        .select("id")
        .eq("plan_id", plan_id)
        .execute()
    )
    existing_ids = {row["id"] for row in (existing.data or [])}

    rows_to_upsert = [row for row in target_rows if row.get("id")]
    if rows_to_upsert:
        supabase.table("plan_items").upsert(rows_to_upsert).execute()

    stale = existing_ids - target_ids
    if stale:
        supabase.table("plan_items").delete().in_("id", list(stale)).execute()


async def reconcile_day_notes(plan_id: str, day_notes: dict[str, str]) -> None:
    """Update plan_days.notes for each day_id present in the Yjs doc.

    We only update — never insert or delete — because plan_days lifecycle is
    REST-driven (EditPlanDialog) and not part of the Yjs schema. We scope the
    update by plan_id so a malicious doc can't reach into another plan's days.
    """
    if not day_notes:
        return
    supabase = get_supabase_client()
    valid = (
        supabase.table("plan_days")
        .select("id")
        .eq("plan_id", plan_id)
        .in_("id", list(day_notes.keys()))
        .execute()
    )
    valid_ids = {row["id"] for row in (valid.data or [])}
    for day_id, notes in day_notes.items():
        if day_id not in valid_ids:
            continue
        supabase.table("plan_days").update({"notes": notes}).eq("id", day_id).execute()
