"use client";

import { Check, CloudOff, Loader2, RefreshCw } from "lucide-react";
import type { HocuspocusProvider } from "@hocuspocus/provider";

import { cn } from "@/lib/utils";
import { type SyncState, useSyncState } from "@/lib/offline/useSyncState";

interface Props {
  provider: HocuspocusProvider | null;
  className?: string;
}

interface BadgeAppearance {
  icon: typeof Check;
  label: string;
  spin: boolean;
  // Tailwind classes — kept inline (rather than a constant) because the four
  // entries are short and read more clearly together.
  classes: string;
}

const BADGE_BY_STATE: Record<SyncState, BadgeAppearance> = {
  "online-synced": {
    icon: Check,
    label: "Synced",
    spin: false,
    classes: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  "online-saving": {
    icon: Loader2,
    label: "Saving…",
    spin: true,
    classes: "border-accent/30 bg-accent/10 text-amber-700",
  },
  "reconnecting": {
    icon: RefreshCw,
    label: "Reconnecting…",
    spin: true,
    classes: "border-accent/30 bg-accent/10 text-amber-700",
  },
  "offline-saved-locally": {
    icon: CloudOff,
    label: "Offline — changes saved locally",
    spin: false,
    classes: "border-border bg-muted text-ink-subtle",
  },
};

/** Compact status pill that surfaces the live sync state of the open plan.
 * Drives the four-state UX laid out in the offline-support ADR — green tick
 * when everything is flushed, amber spinner while a write is in-flight or
 * the websocket is reconnecting, grey cloud-off when navigator is offline.
 *
 * Sits in `PlanHeader` next to `PresenceStrip`; both are read-only signals
 * about the live collaborative session and belong together visually. */
export default function ConnectionStatusBadge({ provider, className }: Props) {
  const { syncState } = useSyncState({ provider });
  const appearance = BADGE_BY_STATE[syncState];
  const Icon = appearance.icon;

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={appearance.label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        appearance.classes,
        className,
      )}
    >
      <Icon
        className={cn("size-3.5", appearance.spin && "animate-spin")}
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="whitespace-nowrap">{appearance.label}</span>
    </span>
  );
}
