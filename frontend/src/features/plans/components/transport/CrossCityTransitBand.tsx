"use client";

import { PlaneLanding, PlaneTakeoff, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PlanItem } from "@/lib/api";

type TransitRole = "arrival" | "departure";

interface Props {
  items: PlanItem[];
  role: TransitRole;
  cityLabel: string;
  onRemove: (itemId: string) => void;
}

const ROLE_STYLE: Record<TransitRole, { icon: typeof PlaneLanding; label: (city: string) => string; accent: string }> = {
  arrival: {
    icon: PlaneLanding,
    label: (city) => `Arriving in ${city}`,
    accent: "border-sky-500/40 bg-sky-500/5",
  },
  departure: {
    icon: PlaneTakeoff,
    label: (city) => `Departing from ${city}`,
    accent: "border-amber-500/40 bg-amber-500/5",
  },
};

export default function CrossCityTransitBand({ items, role, cityLabel, onRemove }: Props) {
  if (items.length === 0) return null;
  const style = ROLE_STYLE[role];
  const Icon = style.icon;

  return (
    <div className={`rounded-2xl border-2 border-dashed ${style.accent} p-3`}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
        <Icon className="size-3.5" strokeWidth={1.5} />
        {style.label(cityLabel)}
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2"
          >
            <div className="flex-1 text-sm">
              <p className="font-medium text-ink">{item.title}</p>
              {item.notes && <p className="mt-0.5 text-xs text-ink-subtle">{item.notes}</p>}
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onRemove(item.id)}
              aria-label={`Remove ${item.title}`}
              className="h-7 w-7 text-ink-subtle hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="size-3.5" strokeWidth={1.5} />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
