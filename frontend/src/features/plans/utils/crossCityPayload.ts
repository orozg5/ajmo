import { type PlanDay, type TransportSuggestion } from "@/lib/api";

export type CrossCityExtraPayload = { destinationId?: string; sortOrder?: number };

export function computeCrossCityExtraPayload(
  selectedDay: PlanDay,
  suggestion: TransportSuggestion,
): CrossCityExtraPayload {
  const dayItems = selectedDay.items;
  const maxSort = dayItems.reduce((m, i) => Math.max(m, i.sort_order ?? 0), 0);
  const minSortRaw = dayItems.reduce((m, i) => Math.min(m, i.sort_order ?? Infinity), Infinity);
  const minSort = isFinite(minSortRaw) ? minSortRaw : 0;

  const isSameDay =
    suggestion.source_day_number != null &&
    suggestion.source_day_number === suggestion.destination_day_number;

  if (isSameDay) {
    // Both cities on the same day: place transport BETWEEN the two sections.
    // Null destination_id + midpoint sort_order causes DayView to render the card
    // between the two city sections (slot-based render).
    const srcItem = dayItems.find((i) => i.id === suggestion.source_item_id);
    const dstItem = dayItems.find((i) => i.id === suggestion.destination_item_id);
    const srcSort = srcItem?.sort_order ?? maxSort;
    const dstSort = dstItem?.sort_order ?? maxSort + 1000;
    return { destinationId: undefined, sortOrder: Math.floor((srcSort + dstSort) / 2) };
  }

  if (selectedDay.day_number === suggestion.source_day_number) {
    // Source day: place at the end of the source-city section as a departure.
    const sourceItem = dayItems.find((i) => i.id === suggestion.source_item_id);
    return { destinationId: sourceItem?.destination_id ?? undefined, sortOrder: maxSort + 1000 };
  }

  if (selectedDay.day_number === suggestion.destination_day_number) {
    // Destination day: place at the beginning of the destination-city section as an arrival.
    const destItem = dayItems.find((i) => i.id === suggestion.destination_item_id);
    return { destinationId: destItem?.destination_id ?? undefined, sortOrder: minSort - 1000 };
  }

  // Transit day (neither source nor destination day): place at the end with no destination.
  return { destinationId: undefined, sortOrder: maxSort + 1000 };
}
