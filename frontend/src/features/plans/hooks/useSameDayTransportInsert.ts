"use client";

import { useCallback, useState } from "react";
import * as Y from "yjs";

import {
  type AddItemPayload,
  type PlanItem,
  type SameDayTransportData,
} from "@/lib/api";

import { computeSortKeyBetween } from "@/features/plans/utils/sortKeys";
import { ensureItemSortKeys } from "@/lib/yjs/mutations";
import { ROOT_ITEMS } from "@/lib/yjs/schema";
import { type SameDayModeOption } from "@/features/plans/hooks/useSameDayTransportOptions";

const MODE_TITLE: Record<SameDayModeOption["mode"], string> = {
  walk: "Walk",
  bike: "Bike",
  drive: "Drive",
  transit: "Transit",
};

function pairKey(srcId: string, dstId: string): string {
  return `${srcId}-${dstId}`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 1)} km`;
  return `${Math.round(meters)} m`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function buildNotes(srcTitle: string, dstTitle: string, option: SameDayModeOption): string {
  const segments = [
    `From ${srcTitle} to ${dstTitle}`,
    `${formatDuration(option.durationSeconds)} · ${formatDistance(option.distanceMeters)}`,
  ];
  if (option.transitSummary) segments.push(option.transitSummary);
  return segments.join(" · ");
}

export interface UseSameDayTransportInsertOptions {
  addItem: (dayId: string, payload: AddItemPayload) => Promise<PlanItem>;
  doc: Y.Doc | null;
}

export interface UseSameDayTransportInsertReturn {
  addingKeys: Set<string>;
  addMode: (params: {
    srcItem: PlanItem;
    dstItem: PlanItem;
    dayId: string;
    option: SameDayModeOption;
  }) => Promise<void>;
}

function readSortKey(doc: Y.Doc, dayId: string, itemId: string): string | null {
  const itemsRoot = doc.getMap(ROOT_ITEMS) as Y.Map<Y.Array<Y.Map<unknown>>>;
  const arr = itemsRoot.get(dayId);
  if (!arr) return null;
  for (let index = 0; index < arr.length; index += 1) {
    const entry = arr.get(index);
    if (entry?.get("id") === itemId) {
      const key = entry.get("sort_key");
      return typeof key === "string" ? key : null;
    }
  }
  return null;
}

export function useSameDayTransportInsert({
  addItem,
  doc,
}: UseSameDayTransportInsertOptions): UseSameDayTransportInsertReturn {
  const [addingKeys, setAddingKeys] = useState<Set<string>>(new Set());

  const addMode = useCallback(
    async ({ srcItem, dstItem, dayId, option }: {
      srcItem: PlanItem;
      dstItem: PlanItem;
      dayId: string;
      option: SameDayModeOption;
    }) => {
      const key = pairKey(srcItem.id, dstItem.id);
      setAddingKeys((prev) => new Set(prev).add(key));

      try {
        // Legacy items created before yAddItem auto-assigned sort_keys carry
        // sort_key=null. Backfill the day's keys in place first, then read
        // the freshly-assigned src/dst keys back out of the doc — otherwise
        // generateKeyBetween(null, null) returns the smallest possible key
        // and the new transport jumps to the top of the section.
        let srcSortKey = srcItem.sort_key;
        let dstSortKey = dstItem.sort_key;
        if (doc && (srcSortKey == null || dstSortKey == null)) {
          ensureItemSortKeys(doc, dayId);
          srcSortKey = readSortKey(doc, dayId, srcItem.id) ?? srcSortKey;
          dstSortKey = readSortKey(doc, dayId, dstItem.id) ?? dstSortKey;
        }
        const sortKey = computeSortKeyBetween(
          { sort_key: srcSortKey } as PlanItem,
          { sort_key: dstSortKey } as PlanItem,
        );

        const aiData: SameDayTransportData = {
          same_day_pair: `${srcItem.id}->${dstItem.id}`,
          mode: option.mode,
          distance_meters: option.distanceMeters,
          duration_seconds: option.durationSeconds,
          ...(option.transitSummary ? { transit_summary: option.transitSummary } : {}),
          ...(option.geometry ? { geometry: option.geometry } : {}),
        };

        const payload: AddItemPayload = {
          item_type: "transport",
          title: MODE_TITLE[option.mode],
          notes: buildNotes(srcItem.title, dstItem.title, option),
          destination_id: srcItem.destination_id ?? undefined,
          // Fractional sort_key is the authoritative ordering field — placing
          // the new transport strictly between src and dst means it stays
          // between them on refresh. (sort_order, the legacy integer, is
          // auto-assigned by the backend and only matters as a fallback when
          // sort_key is null.)
          sort_key: sortKey,
          ai_data: aiData,
        };
        await addItem(dayId, payload);
      } finally {
        setAddingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [addItem, doc],
  );

  return { addingKeys, addMode };
}
