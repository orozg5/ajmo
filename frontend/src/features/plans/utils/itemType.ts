import {
  BedDouble,
  Landmark,
  StickyNote,
  Ticket,
  TrainFront,
  UtensilsCrossed,
} from "lucide-react";

export type ItemType =
  | "attraction"
  | "restaurant"
  | "hotel"
  | "transport"
  | "activity"
  | "note";

type ItemTypeStyle = {
  label: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  accent: string;
};

// Intentionally configurable — adjust per designer feedback.
export const ITEM_TYPE_STYLE: Record<ItemType, ItemTypeStyle> = {
  attraction: { label: "Attraction", Icon: Landmark,        accent: "bg-secondary/70" },
  restaurant: { label: "Restaurant", Icon: UtensilsCrossed, accent: "bg-amber-500/70" },
  activity:   { label: "Activity",   Icon: Ticket,          accent: "bg-emerald-500/70" },
  hotel:      { label: "Hotel",      Icon: BedDouble,       accent: "bg-primary/70" },
  transport:  { label: "Transport",  Icon: TrainFront,      accent: "bg-sky-500/70" },
  note:       { label: "Note",       Icon: StickyNote,      accent: "bg-muted-foreground/40" },
};

// Intentionally configurable — maps item_type to a display emoji.
export const ITEM_TYPE_EMOJI: Record<ItemType, string> = {
  attraction: "🏛",
  restaurant: "🍽",
  hotel: "🏨",
  transport: "🚆",
  activity: "🎭",
  note: "📝",
};
