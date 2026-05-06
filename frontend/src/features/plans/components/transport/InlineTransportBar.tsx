"use client";

import { useMemo } from "react";

import { Bike, Car, Footprints, Loader2, TramFront } from "lucide-react";

import { cn } from "@/lib/utils";
import { type EnrichedItem, type PlanItem } from "@/lib/api";

import {
  type SameDayMode,
  type SameDayModeOption,
  useSameDayTransportOptions,
} from "@/features/plans/hooks/useSameDayTransportOptions";

interface InlineTransportBarProps {
  src: PlanItem;
  dst: PlanItem;
  isAdding: boolean;
  onAdd: (option: SameDayModeOption) => void;
}

interface ModeMeta {
  label: string;
  Icon: typeof Footprints;
}

const MODE_META: Record<SameDayMode, ModeMeta> = {
  walk: { label: "Walk", Icon: Footprints },
  bike: { label: "Bike", Icon: Bike },
  drive: { label: "Drive", Icon: Car },
  transit: { label: "Transit", Icon: TramFront },
};

const MODE_ORDER: SameDayMode[] = ["walk", "bike", "drive", "transit"];

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function coordinatesOf(item: PlanItem): { lat: number; lng: number } | null {
  const data = item.ai_data as EnrichedItem | null;
  if (!data || typeof data.lat !== "number" || typeof data.lng !== "number") return null;
  return { lat: data.lat, lng: data.lng };
}

export default function InlineTransportBar({ src, dst, isAdding, onAdd }: InlineTransportBarProps) {
  const srcCoord = useMemo(() => coordinatesOf(src), [src]);
  const dstCoord = useMemo(() => coordinatesOf(dst), [dst]);

  const { walk, bike, drive, transit, isLoading } = useSameDayTransportOptions({
    src: srcCoord,
    dst: dstCoord,
  });

  if (!srcCoord || !dstCoord) return null;

  const optionsByMode: Record<SameDayMode, SameDayModeOption | null> = {
    walk,
    bike,
    drive,
    transit,
  };

  if (isLoading) {
    return (
      <div className="my-1 flex items-center gap-2 py-2 pl-7 text-xs text-ink-subtle">
        <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
        <span>Looking up transport options…</span>
      </div>
    );
  }

  const availableOptions = MODE_ORDER.filter((mode) => optionsByMode[mode] !== null);
  if (availableOptions.length === 0) return null;

  return (
    <div className="my-1 flex flex-wrap items-center gap-1.5 pl-4">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
        Add transport
      </span>
      {availableOptions.map((mode) => {
        const option = optionsByMode[mode]!;
        const { label, Icon } = MODE_META[mode];
        return (
          <button
            key={mode}
            type="button"
            disabled={isAdding}
            onClick={() => onAdd(option)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs",
              "text-sky-700 dark:text-sky-300",
              "transition-colors hover:border-sky-500/60 hover:bg-sky-500/20",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            <Icon className="size-3.5" strokeWidth={1.5} />
            <span className="font-medium">{label}</span>
            <span className="opacity-75">· {formatDuration(option.durationSeconds)}</span>
            {mode === "transit" && option.transitSummary ? (
              <span className="opacity-60">· {option.transitSummary}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
