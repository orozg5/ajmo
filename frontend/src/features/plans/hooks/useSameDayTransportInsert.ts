"use client";

import { useCallback, useState } from "react";

import {
  type AddItemPayload,
  type PlanItem,
  type SameDayTransportData,
} from "@/lib/api";

import { computeSortKeyBetween } from "@/features/plans/utils/sortKeys";
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

export function useSameDayTransportInsert({
  addItem,
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
          sort_key: computeSortKeyBetween(srcItem, dstItem),
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
    [addItem],
  );

  return { addingKeys, addMode };
}
