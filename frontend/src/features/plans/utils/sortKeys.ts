import { generateKeyBetween } from "fractional-indexing-jittered";

import type { PlanItem } from "@/lib/api";

export function computeSortKeyBetween(
  prev: PlanItem | null | undefined,
  next: PlanItem | null | undefined,
): string {
  return generateKeyBetween(prev?.sort_key ?? null, next?.sort_key ?? null);
}

export function sortItems(items: PlanItem[]): PlanItem[] {
  return [...items].sort((a, b) => {
    if (a.sort_key == null && b.sort_key == null) {
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    }
    if (a.sort_key == null) return 1;
    if (b.sort_key == null) return -1;
    if (a.sort_key < b.sort_key) return -1;
    if (a.sort_key > b.sort_key) return 1;
    return 0;
  });
}

export function appendSortKey(existing: PlanItem[]): string {
  const sorted = sortItems(existing);
  const last = sorted[sorted.length - 1] ?? null;
  return generateKeyBetween(last?.sort_key ?? null, null);
}
