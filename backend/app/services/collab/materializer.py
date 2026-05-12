"""Debounced Yjs → relational materializer.

Hocuspocus calls /internal/collab/changed on every Yjs `onChange`. We coalesce
those signals into a per-plan asyncio.Task that fires after `YJS_IDLE_MS` of
silence. When it fires we read `plans.yjs_state`, decode the binary Y.Doc,
and reconcile the live-edited tables to match.

We intentionally do not run inside a single Postgres transaction — supabase-py
issues each table call as its own REST request. We order writes so foreign-key
constraints are always satisfied:

  1. upsert items                   (FK target for likes/ratings/comments)
  2. update day notes
  3. reconcile likes (plan_item_reactions, kind='like')
  4. reconcile ratings (plan_item_ratings)
  5. reconcile comments (plan_comments)
  6. delete items that disappeared from the doc
     (cascade-deletes their reactions/ratings/item-scoped comments via FK)
"""
from __future__ import annotations

import asyncio
import logging

from pycrdt import Array, Doc, Map, Text

from app.config import settings
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

# Subset of ITEM_FIELDS whose Postgres column is `integer`. Yjs has no
# integer/float distinction (JS numbers are all f64); pycrdt decodes any
# value Yjs encoded as f64 to a Python float, and `json.dumps(0.0)` is
# `"0.0"` which PG refuses for an integer column. Coerce at this seam so
# the relational schema's types are honoured regardless of how the value
# travelled through the CRDT.
INTEGER_ITEM_FIELDS = ("duration_minutes", "sort_order")

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
    like_rows = read_likes(doc)
    rating_rows = read_ratings(doc)
    comment_rows = read_comments(doc, plan_id)

    await reconcile_items(plan_id, item_rows)
    await reconcile_day_notes(plan_id, day_notes)
    await reconcile_likes(plan_id, like_rows)
    await reconcile_ratings(plan_id, rating_rows)
    await reconcile_comments(plan_id, comment_rows)


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


def coerce_integer_fields(row: dict) -> None:
    """Round-trip every INTEGER_ITEM_FIELDS slot through `int()` so a Python
    float decoded from a Yjs f64 encoding becomes a plain integer before we
    ship the row to Supabase. None passes through unchanged; anything that
    fails to coerce (string, dict, etc.) is dropped to None rather than left
    as a value that would also fail PG's integer parser."""
    for field in INTEGER_ITEM_FIELDS:
        value = row.get(field)
        if value is None:
            continue
        try:
            row[field] = int(value)
        except (TypeError, ValueError):
            row[field] = None


def text_or_string_to_str(value: object) -> str | None:
    """Notes fields are Y.Text after Phase 7f, but legacy plans whose
    yjs_state predates the migration may still hold plain strings. Accept
    both shapes and return a plain Python str (or None for empty)."""
    if value is None:
        return None
    if isinstance(value, Text):
        return str(value)
    if isinstance(value, str):
        return value
    # Anything else (number, bool, dict) was never a valid notes shape;
    # ignore and treat as cleared.
    return None


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
            # `notes` is a Y.Text in the post-7f schema; flatten to a plain
            # string before writing to the relational `notes text` column.
            row["notes"] = text_or_string_to_str(row.get("notes"))
            coerce_integer_fields(row)
            row["plan_id"] = plan_id
            row["day_id"] = day_id
            rows.append(row)
    return rows


def read_day_notes(doc: Doc) -> dict[str, str]:
    raw = doc.get(ROOT_DAY_NOTES, type=Map)
    out: dict[str, str] = {}
    for day_id in raw.keys():
        flattened = text_or_string_to_str(raw[day_id])
        if flattened is None:
            continue
        out[day_id] = flattened
    return out


async def reconcile_items(plan_id: str, target_rows: list[dict]) -> None:
    supabase = get_supabase_client()
    valid_destination_ids = fetch_destination_ids(supabase, plan_id)
    target_rows = drop_stale_cross_city_transport(target_rows, valid_destination_ids)

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


def fetch_destination_ids(supabase, plan_id: str) -> set[str]:
    """Return the set of plan_destination ids currently attached to the plan.
    Used to drop cross-city transport items whose source/destination
    destination_id no longer exists — the destination was deleted while a
    client was offline and edits are now arriving back."""
    result = (
        supabase.table("plan_destinations")
        .select("id")
        .eq("plan_id", plan_id)
        .execute()
    )
    return {row["id"] for row in (result.data or [])}


def drop_stale_cross_city_transport(
    rows: list[dict], valid_destination_ids: set[str]
) -> list[dict]:
    """Defensive scrub for the offline-merge case. The Yjs `reorderItems`
    mutation already purges cross-city transport items in touched days, but
    this is the last line of defence: if a destination was deleted while a
    client was offline, any cross-city transport pointing at it is now
    invalid. Drop those rows before upsert so they don't materialise stale
    routing into the relational store. Custom transport (no `cross_city_pair`)
    and items pointing at still-valid destinations are kept as-is."""
    kept: list[dict] = []
    for row in rows:
        if row.get("item_type") != "transport":
            kept.append(row)
            continue
        ai_data = row.get("ai_data")
        if not isinstance(ai_data, dict) or "cross_city_pair" not in ai_data:
            kept.append(row)
            continue
        source = ai_data.get("source_destination_id")
        destination = ai_data.get("destination_destination_id")
        if source in valid_destination_ids and destination in valid_destination_ids:
            kept.append(row)
            continue
        logger.info(
            "Dropping stale cross-city transport %s (source=%s, destination=%s)",
            row.get("id"),
            source,
            destination,
        )
    return kept


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


def read_likes(doc: Doc) -> list[tuple[str, str]]:
    """Return [(plan_item_id, user_id), ...] from the likes root."""
    root = doc.get(ROOT_LIKES, type=Map)
    out: list[tuple[str, str]] = []
    for item_id in root.keys():
        inner = root[item_id]
        if not isinstance(inner, Map):
            continue
        for user_id in inner.keys():
            value = inner[user_id]
            if value:
                out.append((item_id, user_id))
    return out


def read_ratings(doc: Doc) -> list[tuple[str, str, int]]:
    """Return [(plan_item_id, user_id, stars), ...] from the ratings root."""
    root = doc.get(ROOT_RATINGS, type=Map)
    out: list[tuple[str, str, int]] = []
    for item_id in root.keys():
        inner = root[item_id]
        if not isinstance(inner, Map):
            continue
        for user_id in inner.keys():
            value = inner[user_id]
            try:
                stars = int(value)
            except (TypeError, ValueError):
                continue
            if 1 <= stars <= 5:
                out.append((item_id, user_id, stars))
    return out


def read_comments(doc: Doc, plan_id: str) -> list[dict]:
    arr = doc.get(ROOT_COMMENTS, type=Array)
    out: list[dict] = []
    for entry in arr:
        if not isinstance(entry, Map):
            continue
        snap = map_to_dict(entry)
        if not snap.get("id"):
            continue
        row = {field: snap.get(field) for field in COMMENT_FIELDS}
        row["plan_id"] = plan_id
        out.append(row)
    return out


async def reconcile_likes(plan_id: str, target_pairs: list[tuple[str, str]]) -> None:
    """Diff Yjs against plan_item_reactions WHERE kind='like' for items in
    this plan; insert missing, delete stale. Other reaction kinds are left
    untouched — this materializer only owns likes."""
    supabase = get_supabase_client()
    items_q = (
        supabase.table("plan_items")
        .select("id")
        .eq("plan_id", plan_id)
        .execute()
    )
    item_ids = {row["id"] for row in (items_q.data or [])}
    target = {(item_id, user_id) for item_id, user_id in target_pairs if item_id in item_ids}
    if item_ids:
        existing_q = (
            supabase.table("plan_item_reactions")
            .select("plan_item_id, user_id")
            .eq("kind", "like")
            .in_("plan_item_id", list(item_ids))
            .execute()
        )
        existing = {(row["plan_item_id"], row["user_id"]) for row in (existing_q.data or [])}
    else:
        existing = set()

    to_insert = target - existing
    to_delete = existing - target

    if to_insert:
        rows = [
            {"plan_item_id": item_id, "user_id": user_id, "kind": "like"}
            for item_id, user_id in to_insert
        ]
        try:
            supabase.table("plan_item_reactions").upsert(
                rows, on_conflict="plan_item_id,user_id,kind"
            ).execute()
        except Exception:
            logger.exception("Failed to upsert %d likes for plan %s", len(rows), plan_id)
    for item_id, user_id in to_delete:
        try:
            (
                supabase.table("plan_item_reactions")
                .delete()
                .eq("plan_item_id", item_id)
                .eq("user_id", user_id)
                .eq("kind", "like")
                .execute()
            )
        except Exception:
            logger.exception(
                "Failed to delete like (%s, %s) for plan %s", item_id, user_id, plan_id
            )


async def reconcile_ratings(
    plan_id: str, target_rows: list[tuple[str, str, int]]
) -> None:
    """Diff Yjs against plan_item_ratings; upsert by (item, user); delete any
    relational row whose (item, user) pair is no longer in the doc."""
    supabase = get_supabase_client()
    items_q = (
        supabase.table("plan_items")
        .select("id")
        .eq("plan_id", plan_id)
        .execute()
    )
    item_ids = {row["id"] for row in (items_q.data or [])}
    target_keys = {(item_id, user_id) for item_id, user_id, _stars in target_rows if item_id in item_ids}
    if item_ids:
        existing_q = (
            supabase.table("plan_item_ratings")
            .select("plan_item_id, user_id")
            .in_("plan_item_id", list(item_ids))
            .execute()
        )
        existing = {(row["plan_item_id"], row["user_id"]) for row in (existing_q.data or [])}
    else:
        existing = set()

    upserts = [
        {"plan_item_id": item_id, "user_id": user_id, "stars": stars}
        for item_id, user_id, stars in target_rows
        if item_id in item_ids
    ]
    if upserts:
        try:
            supabase.table("plan_item_ratings").upsert(
                upserts, on_conflict="plan_item_id,user_id"
            ).execute()
        except Exception:
            logger.exception(
                "Failed to upsert %d ratings for plan %s", len(upserts), plan_id
            )

    to_delete = existing - target_keys
    for item_id, user_id in to_delete:
        try:
            (
                supabase.table("plan_item_ratings")
                .delete()
                .eq("plan_item_id", item_id)
                .eq("user_id", user_id)
                .execute()
            )
        except Exception:
            logger.exception(
                "Failed to delete rating (%s, %s) for plan %s",
                item_id,
                user_id,
                plan_id,
            )


async def reconcile_comments(plan_id: str, target_rows: list[dict]) -> None:
    """Upsert every comment by id; delete relational rows whose id no longer
    appears in the doc. Soft-delete is preserved via deleted_at — when a row
    is soft-deleted on the client it stays in the Y.Array with deleted_at set,
    so it's still in `target_rows` and just gets updated.

    We strip `plan_item_id` references that don't belong to this plan so a
    malicious doc can't attach a comment to a foreign item.
    """
    if not target_rows:
        # No comments in the doc — clear any leftovers in the DB scoped to this plan.
        supabase = get_supabase_client()
        try:
            supabase.table("plan_comments").delete().eq("plan_id", plan_id).execute()
        except Exception:
            logger.exception("Failed to clear comments for plan %s", plan_id)
        return

    supabase = get_supabase_client()
    items_q = (
        supabase.table("plan_items")
        .select("id")
        .eq("plan_id", plan_id)
        .execute()
    )
    valid_item_ids = {row["id"] for row in (items_q.data or [])}

    sanitized: list[dict] = []
    target_ids: set[str] = set()
    for row in target_rows:
        item_id = row.get("plan_item_id")
        if item_id is not None and item_id not in valid_item_ids:
            row = {**row, "plan_item_id": None}
        sanitized.append(row)
        target_ids.add(row["id"])

    try:
        supabase.table("plan_comments").upsert(
            sanitized, on_conflict="id"
        ).execute()
    except Exception:
        logger.exception(
            "Failed to upsert %d comments for plan %s", len(sanitized), plan_id
        )

    existing_q = (
        supabase.table("plan_comments")
        .select("id")
        .eq("plan_id", plan_id)
        .execute()
    )
    existing_ids = {row["id"] for row in (existing_q.data or [])}
    stale = existing_ids - target_ids
    if stale:
        try:
            supabase.table("plan_comments").delete().in_("id", list(stale)).execute()
        except Exception:
            logger.exception(
                "Failed to delete %d stale comments on plan %s", len(stale), plan_id
            )
