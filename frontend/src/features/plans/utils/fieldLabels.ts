import { type EnrichedItem } from "@/lib/api";

// Intentionally configurable — update this map to change display labels for
// enriched fields across ItemSearch preview and ItemCard expanded view.
// Keys must match the EnrichedItem interface in lib/api/ai.ts.
export const FIELD_LABELS: Partial<Record<keyof EnrichedItem, string>> = {
  description: "Description",
  location: "Address",
  opening_hours: "Hours",
  price_range: "Price",
  cuisine: "Cuisine",
  reservation_tips: "Reservation tips",
  amenities: "Amenities",
  check_in_time: "Check-in",
  booking_tips: "Booking tips",
  schedule: "Schedule",
  duration: "Duration",
  tips: "Tips",
  categories: "Categories",
};
