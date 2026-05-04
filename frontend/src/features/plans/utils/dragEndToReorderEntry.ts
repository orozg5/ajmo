import { type DragEndEvent } from "@dnd-kit/core";

import { type PlanDay, type PlanItem, type ReorderEntry } from "@/lib/api";
import { DAY_DROPPABLE_PREFIX } from "@/features/plans/components/itinerary/DaySidebar";
import { appendSortKey, computeSortKeyBetween, sortItems } from "@/features/plans/utils/sortKeys";

export type DragEndResult = {
  entry: ReorderEntry;
  sourceDayId: string;
  targetDayId: string;
};

// Pure: turns a dnd-kit DragEndEvent into a reorder entry + affected day ids,
// or null when the drag is a no-op (same target, unknown item, missing day,
// or a cross-destination transport move we intentionally forbid).
export function dragEndToReorderEntry(
  event: DragEndEvent,
  itemIndex: Map<string, PlanItem>,
  days: PlanDay[],
): DragEndResult | null {
  const { active, over } = event;
  if (!over || active.id === over.id) return null;

  const activeId = String(active.id);
  const overId = String(over.id);
  const activeItem = itemIndex.get(activeId);
  if (!activeItem) return null;

  const sourceDayId = activeItem.day_id;

  if (overId.startsWith(DAY_DROPPABLE_PREFIX)) {
    const targetDayId = overId.slice(DAY_DROPPABLE_PREFIX.length);
    if (targetDayId === sourceDayId) return null;
    const targetDay = days.find((d) => d.id === targetDayId);
    if (!targetDay) return null;
    const newKey = appendSortKey(targetDay.items);
    return {
      entry: {
        id: activeId,
        sort_key: newKey,
        day_id: targetDayId,
        destination_id: activeItem.destination_id,
      },
      sourceDayId,
      targetDayId,
    };
  }

  const overItem = itemIndex.get(overId);
  if (!overItem) return null;

  // F3: Transport cards can only be reordered within the same destination.
  // Moving them across city sections breaks the source/dest pair marker.
  if (
    activeItem.item_type === "transport" &&
    overItem.destination_id !== activeItem.destination_id
  ) {
    return null;
  }

  const targetDayId = overItem.day_id;
  const targetDay = days.find((d) => d.id === targetDayId);
  if (!targetDay) return null;

  const sortedTargetItems = sortItems(targetDay.items);
  const others = sortedTargetItems.filter((i) => i.id !== activeId);
  const overIdxInOthers = others.findIndex((i) => i.id === overId);
  if (overIdxInOthers === -1) return null;

  const prev = overIdxInOthers > 0 ? others[overIdxInOthers - 1] : null;
  const next = others[overIdxInOthers];
  const newKey = computeSortKeyBetween(prev, next);

  return {
    entry: {
      id: activeId,
      sort_key: newKey,
      day_id: targetDayId,
      destination_id: overItem.destination_id,
    },
    sourceDayId,
    targetDayId,
  };
}
