"use client";

import { generateKeyBetween } from "fractional-indexing-jittered";
import * as Y from "yjs";

import type { AddItemPayload, PlanItem, ReorderEntry } from "@/lib/api";

import {
  ITEM_FIELDS,
  PLAN_META_FIELDS,
  ROOT_DAY_NOTES,
  ROOT_ITEMS,
  ROOT_PLAN_META,
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
    map.set(field, (payload as Record<string, unknown>)[field] ?? null);
  }
  return map;
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
    found.map.set("notes", notes);
  });
}

export function reorderItems(doc: Y.Doc, entries: ReorderEntry[]): void {
  doc.transact(() => {
    const root = getItemsRoot(doc);
    for (const entry of entries) {
      const found = findItem(doc, entry.id);
      if (!found) continue;
      const fromArr = root.get(found.dayId);
      if (!fromArr) continue;

      // Snapshot fields, drop the old node, then insert a fresh node with
      // updated day_id/sort_key in the destination array.
      const snapshot: Record<string, unknown> = {};
      for (const field of ITEM_FIELDS) snapshot[field] = found.map.get(field) ?? null;
      snapshot.day_id = entry.day_id;
      snapshot.sort_key = entry.sort_key;
      snapshot.destination_id = entry.destination_id ?? snapshot.destination_id ?? null;

      fromArr.delete(found.index, 1);
      const toArr = getDayArray(doc, entry.day_id);
      const replacement = new Y.Map<unknown>();
      for (const [key, value] of Object.entries(snapshot)) replacement.set(key, value);
      toArr.push([replacement]);
    }
  });
}

export function setDayNotes(doc: Y.Doc, dayId: string, notes: string | null): void {
  // Always set, never delete. If we delete the key on empty input, allNotes
  // loses the entry, and the days-merging fallback in usePlanItinerary picks
  // up the stale REST value (last materialized) — visually snapping the
  // textarea back to the previous content as soon as the user clears it.
  doc.transact(() => {
    const root = doc.getMap(ROOT_DAY_NOTES);
    root.set(dayId, notes ?? "");
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
