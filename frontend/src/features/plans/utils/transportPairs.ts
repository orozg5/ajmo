import { type DestinationResponse, type PlanDay } from "@/lib/api";
import { sortItems } from "@/features/plans/utils/sortKeys";

// True when any consecutive same-destination non-transport adjacency in the day
// lacks a transport card between them. Used to decide whether to show the
// "Get transport" affordance on the day header.
export function hasPendingWithinDayPairs(
  day: PlanDay,
  dayDestinations: DestinationResponse[],
): boolean {
  for (const dest of dayDestinations) {
    const sectionItems = sortItems(day.items.filter((i) => i.destination_id === dest.id));
    for (let i = 0; i < sectionItems.length - 1; i++) {
      const curr = sectionItems[i];
      const next = sectionItems[i + 1];
      if (curr.item_type === "transport" || next.item_type === "transport") continue;
      const hasTransportBetween = sectionItems.some(
        (t, idx) => t.item_type === "transport" && idx > i && idx < i + 1,
      );
      if (!hasTransportBetween) return true;
    }
  }
  return false;
}
