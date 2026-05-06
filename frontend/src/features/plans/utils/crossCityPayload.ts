import {
  type DestinationResponse,
  type PlanDay,
  type TransportSuggestion,
} from "@/lib/api";

export type CrossCityExtraPayload = { destinationId?: string; sortOrder?: number };

export interface CrossCitySlotOption {
  key: string;
  label: string;
  dayId: string;
  payload: CrossCityExtraPayload;
}

// DayView ranks destination sections by `dest.sort_order * SECTION_ANCHOR_SCALE`
// when the section has no items on that day; matching that scale here lets us
// compute a sort_order that lands strictly between two empty city sections.
const SECTION_ANCHOR_SCALE = 100_000;
const SLOT_SPACING = 1_000;

function findDestinationFor(
  destinations: DestinationResponse[],
  destinationId: string | null,
  cityName: string | null,
): DestinationResponse | undefined {
  if (destinationId) {
    const byId = destinations.find((d) => d.id === destinationId);
    if (byId) return byId;
  }
  if (cityName) {
    return destinations.find((d) => d.city === cityName);
  }
  return undefined;
}

function computeBetweenPayload(
  selectedDay: PlanDay,
  sourceDest: DestinationResponse,
  destinationDest: DestinationResponse,
): CrossCityExtraPayload {
  // Place at midpoint between the bottom of the source section and the top of
  // the destination section on this day. Sections without items fall back to
  // their destination sort_order * SECTION_ANCHOR_SCALE — same anchor DayView
  // uses to position empty sections in its slot algorithm.
  const sourceItems = selectedDay.items.filter((i) => i.destination_id === sourceDest.id);
  const destItems = selectedDay.items.filter((i) => i.destination_id === destinationDest.id);

  const sourceMaxAnchor = sourceItems.length > 0
    ? Math.max(...sourceItems.map((i) => i.sort_order ?? 0))
    : sourceDest.sort_order * SECTION_ANCHOR_SCALE;
  const destinationMinAnchor = destItems.length > 0
    ? Math.min(...destItems.map((i) => i.sort_order ?? 0))
    : destinationDest.sort_order * SECTION_ANCHOR_SCALE;

  const midpoint = Math.floor((sourceMaxAnchor + destinationMinAnchor) / 2);
  return { destinationId: undefined, sortOrder: midpoint };
}

function computeDeparturePayload(
  selectedDay: PlanDay,
  sourceDest: DestinationResponse,
): CrossCityExtraPayload {
  // Bottom of the source-city section on this day, tagged with the source's
  // destination_id so it visually belongs to the source's group.
  const sourceItems = selectedDay.items.filter((i) => i.destination_id === sourceDest.id);
  const sourceMax = sourceItems.length > 0
    ? Math.max(...sourceItems.map((i) => i.sort_order ?? 0))
    : sourceDest.sort_order * SECTION_ANCHOR_SCALE;
  return { destinationId: sourceDest.id, sortOrder: sourceMax + SLOT_SPACING };
}

function computeArrivalPayload(
  selectedDay: PlanDay,
  destinationDest: DestinationResponse,
): CrossCityExtraPayload {
  // Top of the destination-city section on this day, tagged with the
  // destination_id so it visually belongs to the dest's group.
  const destItems = selectedDay.items.filter((i) => i.destination_id === destinationDest.id);
  const destMin = destItems.length > 0
    ? Math.min(...destItems.map((i) => i.sort_order ?? 0))
    : destinationDest.sort_order * SECTION_ANCHOR_SCALE;
  return { destinationId: destinationDest.id, sortOrder: destMin - SLOT_SPACING };
}

function computeSameDayItemBetweenPayload(
  selectedDay: PlanDay,
  suggestion: TransportSuggestion,
): CrossCityExtraPayload {
  // Both items live on the same day — place transport at the midpoint of
  // their actual sort_orders. More precise than the section-anchor variant.
  const dayItems = selectedDay.items;
  const maxSort = dayItems.reduce((m, i) => Math.max(m, i.sort_order ?? 0), 0);
  const srcItem = dayItems.find((i) => i.id === suggestion.source_item_id);
  const dstItem = dayItems.find((i) => i.id === suggestion.destination_item_id);
  const srcSort = srcItem?.sort_order ?? maxSort;
  const dstSort = dstItem?.sort_order ?? maxSort + SLOT_SPACING;
  return { destinationId: undefined, sortOrder: Math.floor((srcSort + dstSort) / 2) };
}

/**
 * Kept for callers (and old tests) that pass a (day, suggestion) tuple. The
 * new picker uses purpose-specific helpers above; this stays as a thin wrapper
 * routing by `selectedDay.day_number` against the suggestion's day numbers.
 */
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
    return computeSameDayItemBetweenPayload(selectedDay, suggestion);
  }
  if (selectedDay.day_number === suggestion.source_day_number) {
    const sourceItem = dayItems.find((i) => i.id === suggestion.source_item_id);
    return { destinationId: sourceItem?.destination_id ?? undefined, sortOrder: maxSort + SLOT_SPACING };
  }
  if (selectedDay.day_number === suggestion.destination_day_number) {
    const destItem = dayItems.find((i) => i.id === suggestion.destination_item_id);
    return { destinationId: destItem?.destination_id ?? undefined, sortOrder: minSort - SLOT_SPACING };
  }
  return { destinationId: undefined, sortOrder: maxSort + SLOT_SPACING };
}

/**
 * Days where both destinations are scheduled (`plan_destination_days`). When
 * non-empty, "between" placements take precedence over depart/arrive on those
 * days because the cities literally overlap there — there's no "leave Paris"
 * on a day that's still scheduled as Paris.
 */
export function sharedDestinationDays(
  sourceDest: DestinationResponse | undefined,
  destinationDest: DestinationResponse | undefined,
): number[] {
  if (!sourceDest || !destinationDest || sourceDest.id === destinationDest.id) return [];
  const destDays = new Set(destinationDest.days);
  return sourceDest.days.filter((dayNumber) => destDays.has(dayNumber)).sort((a, b) => a - b);
}

export function getSlotOptions(
  suggestion: TransportSuggestion,
  days: PlanDay[],
  destinations: DestinationResponse[],
): CrossCitySlotOption[] {
  const sourceCity = suggestion.source_city ?? suggestion.source_item_title ?? "?";
  const destinationCity = suggestion.destination_city ?? suggestion.destination_item_title ?? "?";

  const sourceDest = findDestinationFor(
    destinations,
    suggestion.source_destination_id,
    suggestion.source_city,
  );
  const destinationDest = findDestinationFor(
    destinations,
    suggestion.destination_destination_id,
    suggestion.destination_city,
  );

  // Item-level same day (both source and dest items on the same day): collapse
  // to a single, item-precise "between" placement. This is the rarer case
  // where the user has already placed both cities' items on one day.
  if (
    suggestion.source_day_number != null
    && suggestion.source_day_number === suggestion.destination_day_number
  ) {
    const day = days.find((d) => d.day_number === suggestion.source_day_number);
    if (day) {
      return [
        {
          key: `between-${suggestion.source_day_number}`,
          label: `Day ${suggestion.source_day_number} · between ${sourceCity} and ${destinationCity}`,
          dayId: day.id,
          payload: computeSameDayItemBetweenPayload(day, suggestion),
        },
      ];
    }
  }

  // Prefer destination scheduling (plan_destination_days) over item days for
  // determining where transport can sit. Items are activities; the
  // destination tells us where the user actually IS on each day.
  const sourceDays = sourceDest?.days ?? [];
  const destDays = destinationDest?.days ?? [];
  const sourceLastDay = sourceDays.length > 0
    ? Math.max(...sourceDays)
    : suggestion.source_day_number;
  const destFirstDay = destDays.length > 0
    ? Math.min(...destDays)
    : suggestion.destination_day_number;

  const sharedDays = sharedDestinationDays(sourceDest, destinationDest);
  const sharedSet = new Set(sharedDays);

  const between: CrossCitySlotOption[] = [];
  const around: CrossCitySlotOption[] = [];

  if (sourceDest && destinationDest && sourceDest.id !== destinationDest.id) {
    for (const dayNumber of sharedDays) {
      const day = days.find((d) => d.day_number === dayNumber);
      if (!day) continue;
      between.push({
        key: `between-${dayNumber}`,
        label: `Day ${dayNumber} · between ${sourceCity} and ${destinationCity}`,
        dayId: day.id,
        payload: computeBetweenPayload(day, sourceDest, destinationDest),
      });
    }
  }

  // Depart only on the source's last scheduled day — and only when that day
  // isn't already a shared "between" day. You can't depart Paris on Day 1 if
  // Paris is also scheduled on Days 2 and 3.
  if (sourceLastDay != null && !sharedSet.has(sourceLastDay)) {
    const day = days.find((d) => d.day_number === sourceLastDay);
    if (day && sourceDest) {
      around.push({
        key: "departure",
        label: `Day ${sourceLastDay} · depart ${sourceCity}`,
        dayId: day.id,
        payload: computeDeparturePayload(day, sourceDest),
      });
    } else if (day) {
      // Fallback for cached suggestions that pre-date source_destination_id.
      around.push({
        key: "departure",
        label: `Day ${sourceLastDay} · depart ${sourceCity}`,
        dayId: day.id,
        payload: computeCrossCityExtraPayload(day, suggestion),
      });
    }
  }

  // Arrive only on the destination's first scheduled day, and only when that
  // day isn't already a shared "between" day.
  if (destFirstDay != null && !sharedSet.has(destFirstDay)) {
    const day = days.find((d) => d.day_number === destFirstDay);
    if (day && destinationDest) {
      around.push({
        key: "arrival",
        label: `Day ${destFirstDay} · arrive in ${destinationCity}`,
        dayId: day.id,
        payload: computeArrivalPayload(day, destinationDest),
      });
    } else if (day) {
      around.push({
        key: "arrival",
        label: `Day ${destFirstDay} · arrive in ${destinationCity}`,
        dayId: day.id,
        payload: computeCrossCityExtraPayload(day, suggestion),
      });
    }
  }

  return [...between, ...around];
}

export function formatDestinationDayRange(days: number[]): string {
  if (days.length === 0) return "";
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 1) return `Day ${sorted[0]}`;
  const contiguous = sorted.every((dayNumber, index) =>
    index === 0 || dayNumber === sorted[index - 1] + 1,
  );
  if (contiguous) return `Days ${sorted[0]}–${sorted[sorted.length - 1]}`;
  return `Days ${sorted.join(", ")}`;
}

/**
 * Subtitle for the panel: shows the day(s) on which the actual transition
 * happens, not the spread of either destination. For Paris (1-3) → Le Mans
 * (3) that's `Day 3` (the shared day); for Paris (1-2) → Le Mans (3) it's
 * `Day 2 → Day 3`. Returns null when neither shared days nor a clean
 * source-last → dest-first jump can be derived.
 */
export function formatTransitionLabel(
  suggestion: TransportSuggestion,
  destinations: DestinationResponse[],
): string | null {
  const sourceDest = findDestinationFor(
    destinations,
    suggestion.source_destination_id,
    suggestion.source_city,
  );
  const destinationDest = findDestinationFor(
    destinations,
    suggestion.destination_destination_id,
    suggestion.destination_city,
  );

  const shared = sharedDestinationDays(sourceDest, destinationDest);
  if (shared.length > 0) {
    if (shared.length === 1) return `Day ${shared[0]}`;
    return `Days ${shared.join(", ")}`;
  }

  const sourceLast = sourceDest && sourceDest.days.length > 0
    ? Math.max(...sourceDest.days)
    : suggestion.source_day_number;
  const destFirst = destinationDest && destinationDest.days.length > 0
    ? Math.min(...destinationDest.days)
    : suggestion.destination_day_number;
  if (sourceLast != null && destFirst != null) {
    if (sourceLast === destFirst) return `Day ${sourceLast}`;
    return `Day ${sourceLast} → Day ${destFirst}`;
  }
  return null;
}
