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
  // Type-coloured filled badge — bg + text, both light & dark friendly.
  badge: string;
  // Soft surface tint applied to the whole card so types are readable at a glance.
  tint: string;
};

// Intentionally configurable — adjust per designer feedback.
export const ITEM_TYPE_STYLE: Record<ItemType, ItemTypeStyle> = {
  attraction: {
    label: "Attraction",
    Icon: Landmark,
    badge: "bg-secondary/15 text-secondary border-secondary/30",
    tint: "bg-secondary/[0.03]",
  },
  restaurant: {
    label: "Restaurant",
    Icon: UtensilsCrossed,
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    tint: "bg-amber-500/[0.04]",
  },
  activity: {
    label: "Activity",
    Icon: Ticket,
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    tint: "bg-emerald-500/[0.04]",
  },
  hotel: {
    label: "Hotel",
    Icon: BedDouble,
    badge: "bg-primary/15 text-primary border-primary/30",
    tint: "bg-primary/[0.03]",
  },
  transport: {
    label: "Transport",
    Icon: TrainFront,
    badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    tint: "bg-sky-500/[0.04]",
  },
  note: {
    label: "Note",
    Icon: StickyNote,
    badge: "bg-muted text-ink-subtle border-border",
    tint: "bg-muted/30",
  },
};

