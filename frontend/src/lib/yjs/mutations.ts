"use client";

import { generateKeyBetween } from "fractional-indexing-jittered";
import * as Y from "yjs";

import type { AddItemPayload, PlanItem, ReorderEntry } from "@/lib/api";

import {
  COMMENT_FIELDS,
  ITEM_FIELDS,
  PLAN_META_FIELDS,
  ROOT_COMMENTS,
  ROOT_DAY_NOTES,
  ROOT_ITEMS,
  ROOT_LIKES,
  ROOT_PLAN_META,
  ROOT_RATINGS,
  type PlanMetaPatch,
} from "./schema";

function getItemsRoot(doc: Y.Doc): Y.Map<Y.Array<Y.Map<unknown>>> {
  return doc.getMap(ROOT_ITEMS) as Y.Map<Y.Array<Y.Map<unknown>>>;
}

function getDayArray(doc: Y.Doc, dayId: string): Y.Array<Y.Map<unknown>> {
  const root = getItemsRoot(doc);
  let arr = root.get(dayId);
  if (!arr) {
    arr = new Y.Array<Y.Map<unknown>>();
    root.set(dayId, arr);
  }
  return arr;
}

function findItem(
  doc: Y.Doc,
  itemId: string,
): { dayId: string; index: number; map: Y.Map<unknown> } | null {
  const root = getItemsRoot(doc);
  for (const dayId of Array.from(root.keys())) {
    const arr = root.get(dayId);
    if (!arr) continue;
    for (let index = 0; index < arr.length; index += 1) {
      const map = arr.get(index);
      if (map?.get("id") === itemId) {
        return { dayId, index, map };
      }
    }
  }
  return null;
}

function buildItemMap(payload: Partial<PlanItem> & { id: string }): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const field of ITEM_FIELDS) {
    if (field === "notes") continue;
    map.set(field, (payload as Record<string, unknown>)[field] ?? null);
  }
  // The notes field is stored as a Y.Text so concurrent edits can merge
  // character-by-character instead of last-writer-wins. See ADR 2026-05-09
  // (Phase 7f). null means "no notes"; non-null gets a fresh Y.Text seeded
  // with the initial content.
  const notes = payload.notes ?? null;
  if (notes === null) {
    map.set("notes", null);
  } else {
    map.set("notes", new Y.Text(notes));
  }
  return map;
}

/** Apply the minimum delete + insert needed to turn `yText` into `newText`.
 * Concurrent users typing at different positions can both have their inserts
 * land — only a literally-overlapping span picks a deterministic ordering.
 *
 * Common-prefix / common-suffix is the simplest correct diff for the
 * single-textarea typing pattern that's our entire offline use case here.
 * Larger structural edits (paste a paragraph in the middle) still produce
 * one delete + one insert at the right span, which is much better than
 * blast-and-replace and good enough until someone wants a CodeMirror /
 * ProseMirror binding. */
function applyTextDiff(yText: Y.Text, newText: string): void {
  const oldText = yText.toString();
  if (oldText === newText) return;
  let prefix = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (prefix < minLen && oldText[prefix] === newText[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < oldText.length - prefix &&
    suffix < newText.length - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const deleteLen = oldText.length - prefix - suffix;
  const insertText = newText.substring(prefix, newText.length - suffix);
  if (deleteLen > 0) yText.delete(prefix, deleteLen);
  if (insertText.length > 0) yText.insert(prefix, insertText);
}

function lastSortKey(arr: Y.Array<Y.Map<unknown>>): string | null {
  let max: string | null = null;
  for (let index = 0; index < arr.length; index += 1) {
    const entry = arr.get(index);
    const key = entry?.get("sort_key");
    if (typeof key === "string" && (max === null || key > max)) max = key;
  }
  return max;
}

export function addItem(
  doc: Y.Doc,
  dayId: string,
  payload: AddItemPayload,
  options: { addedBy: string | null; destinationFallback: string | null },
): PlanItem {
  const id = crypto.randomUUID();
  const built: Partial<PlanItem> & { id: string } = {
    id,
    day_id: dayId,
    item_type: payload.item_type,
    title: payload.title,
    notes: payload.notes ?? null,
    location: payload.location ?? null,
    start_time: payload.start_time ?? null,
    end_time: payload.end_time ?? null,
    duration_minutes: payload.duration_minutes ?? null,
    sort_key: payload.sort_key ?? null,
    sort_order: payload.sort_order ?? null,
    place_id: payload.place_id ?? null,
    ai_data: payload.ai_data ?? null,
    destination_id: payload.destination_id ?? options.destinationFallback,
    added_by: options.addedBy,
  };

  doc.transact(() => {
    const arr = getDayArray(doc, dayId);
    // Always assign a fractional sort_key when one wasn't passed in. Without
    // this, items added through the standard UI carried sort_key=null, and
    // the same-day transport hook's generateKeyBetween(null, null) returned
    // the smallest possible key — placing the new transport above the source
    // item instead of between source and destination.
    if (built.sort_key == null) {
      built.sort_key = generateKeyBetween(lastSortKey(arr), null);
    }
    arr.push([buildItemMap(built)]);
  });

  return { ...built, plan_id: "" } as unknown as PlanItem;
}

/** Backfill missing sort_keys on every item in a day, preserving the current
 * visual order (sort_key first, then sort_order, then array index). Idempotent
 * — does nothing if every item already has a string sort_key. The same-day
 * transport hook calls this before computing a between-key, so legacy items
 * created without sort_keys can still be bracketed correctly. */
export function ensureItemSortKeys(doc: Y.Doc, dayId: string): void {
  doc.transact(() => {
    const arr = getDayArray(doc, dayId);
    const indexed = arr.toArray().map((map, index) => ({ map, index }));
    if (indexed.every(({ map }) => typeof map.get("sort_key") === "string")) return;

    indexed.sort((a, b) => {
      const aKey = a.map.get("sort_key");
      const bKey = b.map.get("sort_key");
      if (typeof aKey === "string" && typeof bKey === "string") {
        if (aKey < bKey) return -1;
        if (aKey > bKey) return 1;
      } else if (typeof aKey === "string") {
        return -1;
      } else if (typeof bKey === "string") {
        return 1;
      }
      const aOrder = (a.map.get("sort_order") as number | null) ?? 0;
      const bOrder = (b.map.get("sort_order") as number | null) ?? 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    });

    let prev: string | null = null;
    for (const { map } of indexed) {
      const next = generateKeyBetween(prev, null);
      map.set("sort_key", next);
      prev = next;
    }
  });
}

export function removeItem(doc: Y.Doc, itemId: string): void {
  doc.transact(() => {
    const found = findItem(doc, itemId);
    if (!found) return;
    const root = getItemsRoot(doc);
    const arr = root.get(found.dayId);
    arr?.delete(found.index, 1);
  });
}

export function updateItemNotes(doc: Y.Doc, itemId: string, notes: string | null): void {
  doc.transact(() => {
    const found = findItem(doc, itemId);
    if (!found) return;
    const existing = found.map.get("notes");
    if (notes === null) {
      // Clearing notes — drop any existing Y.Text and store null.
      found.map.set("notes", null);
      return;
    }
    if (existing instanceof Y.Text) {
      applyTextDiff(existing, notes);
    } else {
      // First write (or legacy plain-string entry) — install a fresh Y.Text
      // seeded with the new content. Subsequent edits will diff against it.
      found.map.set("notes", new Y.Text(notes));
    }
  });
}

export function reorderItems(doc: Y.Doc, entries: ReorderEntry[]): void {
  doc.transact(() => {
    const root = getItemsRoot(doc);
    const touchedDayIds = new Set<string>();
    for (const entry of entries) {
      const found = findItem(doc, entry.id);
      if (!found) continue;
      const fromArr = root.get(found.dayId);
      if (!fromArr) continue;

      // Snapshot fields, drop the old node, then insert a fresh node with
      // updated day_id/sort_key in the destination array. The notes field
      // gets flattened to a string and re-wrapped in a new Y.Text on the
      // replacement — a Yjs CRDT type can't be moved between parents, and
      // reorder-during-concurrent-notes-edit is rare enough that losing the
      // few-second CRDT history is acceptable.
      const snapshot: Record<string, unknown> = {};
      for (const field of ITEM_FIELDS) {
        if (field === "notes") continue;
        snapshot[field] = found.map.get(field) ?? null;
      }
      const existingNotes = found.map.get("notes");
      const notesString =
        existingNotes instanceof Y.Text
          ? existingNotes.toString()
          : typeof existingNotes === "string"
            ? existingNotes
            : null;
      snapshot.day_id = entry.day_id;
      snapshot.sort_key = entry.sort_key;
      snapshot.destination_id = entry.destination_id ?? snapshot.destination_id ?? null;

      touchedDayIds.add(found.dayId);
      touchedDayIds.add(entry.day_id);

      fromArr.delete(found.index, 1);
      const toArr = getDayArray(doc, entry.day_id);
      const replacement = new Y.Map<unknown>();
      for (const [key, value] of Object.entries(snapshot)) replacement.set(key, value);
      replacement.set("notes", notesString === null ? null : new Y.Text(notesString));
      toArr.push([replacement]);
    }
    purgeStaleCrossCityTransport(doc, touchedDayIds);
  });
}

/** Drop every cross-city transport item that lives in one of the touched
 * days. A reorder may have changed which destinations sit on either side of
 * the transport, so the original pair (Paris→Berlin) may now describe the
 * wrong direction (Berlin→Paris). Deleting forces the user to re-fetch
 * suggestions on the "Transport needs refresh" banner — the alternative
 * (silently keeping wrong-direction transport) was the existing online bug
 * the offline-support work also fixes.
 *
 * Custom transport items (user-typed, no `ai_data.cross_city_pair`) are
 * direction-agnostic and left alone — they're "I'll take the train" notes,
 * not LLM-generated routing. */
function purgeStaleCrossCityTransport(doc: Y.Doc, dayIds: Set<string>): void {
  const root = getItemsRoot(doc);
  for (const dayId of dayIds) {
    const arr = root.get(dayId);
    if (!arr) continue;
    // Walk back-to-front so deletions don't shift the indices we're iterating.
    for (let index = arr.length - 1; index >= 0; index -= 1) {
      const map = arr.get(index);
      if (!map) continue;
      if (map.get("item_type") !== "transport") continue;
      const aiData = map.get("ai_data");
      if (
        !aiData ||
        typeof aiData !== "object" ||
        !("cross_city_pair" in (aiData as Record<string, unknown>))
      ) {
        continue;
      }
      arr.delete(index, 1);
    }
  }
}

export function setDayNotes(doc: Y.Doc, dayId: string, notes: string | null): void {
  // Always set, never delete. If we delete the key on empty input, allNotes
  // loses the entry, and the days-merging fallback in usePlanItinerary picks
  // up the stale REST value (last materialized) — visually snapping the
  // textarea back to the previous content as soon as the user clears it.
  //
  // Stored as Y.Text so concurrent edits merge character-by-character. The
  // null-or-empty-string distinction collapses to "" — the read hook always
  // returns a string for the dayId once we've ever written it.
  const newText = notes ?? "";
  doc.transact(() => {
    const root = doc.getMap(ROOT_DAY_NOTES);
    const existing = root.get(dayId);
    if (existing instanceof Y.Text) {
      applyTextDiff(existing, newText);
    } else {
      root.set(dayId, new Y.Text(newText));
    }
  });
}

export function clearDayContent(doc: Y.Doc, dayId: string): void {
  doc.transact(() => {
    getItemsRoot(doc).delete(dayId);
    doc.getMap(ROOT_DAY_NOTES).delete(dayId);
  });
}

/** Broadcast a plan-meta change to peers. REST is the source of truth at
 * rest — call this only after the PATCH has succeeded so the Y.Map can never
 * outrun what the database accepted. The materializer ignores ROOT_PLAN_META;
 * this map exists purely so other connected clients update without a refresh. */
export function setPlanMeta(doc: Y.Doc, patch: PlanMetaPatch): void {
  doc.transact(() => {
    const root = doc.getMap(ROOT_PLAN_META);
    for (const field of PLAN_META_FIELDS) {
      if (field in patch) root.set(field, patch[field] ?? null);
    }
  });
}

// ── Likes ────────────────────────────────────────────────────────────────────

function getLikesRoot(doc: Y.Doc): Y.Map<Y.Map<boolean>> {
  return doc.getMap(ROOT_LIKES) as Y.Map<Y.Map<boolean>>;
}

/** Toggle the current user's like on an item. Presence of a key in the inner
 * map means liked; absent means not liked. We mutate inside a single
 * transaction so peers see one atomic update. */
export function toggleLike(doc: Y.Doc, itemId: string, userId: string): boolean {
  let liked = false;
  doc.transact(() => {
    const root = getLikesRoot(doc);
    let inner = root.get(itemId);
    if (!inner) {
      inner = new Y.Map<boolean>();
      root.set(itemId, inner);
    }
    if (inner.has(userId)) {
      inner.delete(userId);
      liked = false;
    } else {
      inner.set(userId, true);
      liked = true;
    }
  });
  return liked;
}

// ── Ratings ──────────────────────────────────────────────────────────────────

function getRatingsRoot(doc: Y.Doc): Y.Map<Y.Map<number>> {
  return doc.getMap(ROOT_RATINGS) as Y.Map<Y.Map<number>>;
}

export function setRating(
  doc: Y.Doc,
  itemId: string,
  userId: string,
  stars: number,
): void {
  if (stars < 1 || stars > 5) return;
  doc.transact(() => {
    const root = getRatingsRoot(doc);
    let inner = root.get(itemId);
    if (!inner) {
      inner = new Y.Map<number>();
      root.set(itemId, inner);
    }
    inner.set(userId, stars);
  });
}

export function clearRating(doc: Y.Doc, itemId: string, userId: string): void {
  doc.transact(() => {
    const root = getRatingsRoot(doc);
    const inner = root.get(itemId);
    if (!inner) return;
    inner.delete(userId);
  });
}

// ── Comments ─────────────────────────────────────────────────────────────────

function getCommentsRoot(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray(ROOT_COMMENTS) as Y.Array<Y.Map<unknown>>;
}

function findComment(
  doc: Y.Doc,
  commentId: string,
): { index: number; map: Y.Map<unknown> } | null {
  const arr = getCommentsRoot(doc);
  for (let index = 0; index < arr.length; index += 1) {
    const map = arr.get(index);
    if (map?.get("id") === commentId) return { index, map };
  }
  return null;
}

export interface PostCommentInput {
  authorId: string;
  body: string;
  planItemId?: string | null;
  parentId?: string | null;
}

/** Post a new comment. Generates a UUID client-side so the materializer can
 * upsert by id without an extra round-trip. created_at/updated_at are set
 * client-side too — clocks are imperfect but ordering is by created_at and
 * peers display rows as they arrive, so a few hundred ms of skew is fine. */
export function postComment(doc: Y.Doc, input: PostCommentInput): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  doc.transact(() => {
    const map = new Y.Map<unknown>();
    map.set("id", id);
    map.set("plan_item_id", input.planItemId ?? null);
    map.set("parent_id", input.parentId ?? null);
    map.set("author_id", input.authorId);
    map.set("body", input.body);
    map.set("created_at", now);
    map.set("updated_at", now);
    map.set("deleted_at", null);
    getCommentsRoot(doc).push([map]);
  });
  return id;
}

export function editComment(doc: Y.Doc, commentId: string, body: string): void {
  doc.transact(() => {
    const found = findComment(doc, commentId);
    if (!found) return;
    if (found.map.get("deleted_at") !== null) return;
    found.map.set("body", body);
    found.map.set("updated_at", new Date().toISOString());
  });
}

/** Soft-delete: set deleted_at + clear body. Replies stay attached so the
 * thread shape doesn't collapse. */
export function deleteComment(doc: Y.Doc, commentId: string): void {
  doc.transact(() => {
    const found = findComment(doc, commentId);
    if (!found) return;
    if (found.map.get("deleted_at") !== null) return;
    found.map.set("body", "");
    found.map.set("deleted_at", new Date().toISOString());
    found.map.set("updated_at", new Date().toISOString());
  });
}

export { COMMENT_FIELDS };
