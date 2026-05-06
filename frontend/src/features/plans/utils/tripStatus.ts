import { CalendarClock, CalendarOff, History, Plane, type LucideIcon } from "lucide-react";

import { type Plan } from "@/lib/api";

export type TripStatus = "upcoming" | "ongoing" | "past" | "undated";

// Intentionally configurable — update this map to change the dashboard status
// pill labels and the corresponding filter pill labels in TripFilterBar.
export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  upcoming: "Upcoming",
  ongoing: "Ongoing",
  past: "Past",
  undated: "No dates",
};

export const TRIP_STATUS_ICON: Record<TripStatus, LucideIcon> = {
  upcoming: CalendarClock,
  ongoing: Plane,
  past: History,
  undated: CalendarOff,
};

export const TRIP_STATUS_ORDER: readonly TripStatus[] = [
  "ongoing",
  "upcoming",
  "past",
  "undated",
] as const;

function toIsoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function getTripStatus(plan: Pick<Plan, "date_from" | "date_to">, today: Date = new Date()): TripStatus {
  const todayKey = toIsoDay(today);
  const start = plan.date_from;
  const end = plan.date_to;

  if (!start && !end) return "undated";

  const effectiveStart = start ?? end!;
  const effectiveEnd = end ?? start!;

  if (todayKey < effectiveStart) return "upcoming";
  if (todayKey > effectiveEnd) return "past";
  return "ongoing";
}
