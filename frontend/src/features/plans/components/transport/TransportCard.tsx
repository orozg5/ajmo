"use client";

import { Bike, Bus, Car, Footprints, Plane, Sailboat, Train, TrainFront, TramFront, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  type CrossCityTransportData,
  type CrossCityTransportMode,
  type PlanItem,
  type SameDayTransportData,
  type SameDayTransportMode,
} from "@/lib/api";
import {
  formatDistance,
  formatDuration,
} from "@/features/plans/utils/transportFormat";

interface Props {
  item: PlanItem;
  onRemove: () => void;
  isHighlighted?: boolean;
  onHoverChange?: (itemId: string, hovered: boolean) => void;
}

const SAME_DAY_ICON: Record<SameDayTransportMode, typeof Footprints> = {
  walk: Footprints,
  bike: Bike,
  drive: Car,
  transit: TramFront,
};

const SAME_DAY_LABEL: Record<SameDayTransportMode, string> = {
  walk: "Walk",
  bike: "Bike",
  drive: "Drive",
  transit: "Transit",
};

// Hex values intentionally match the map's route-line colors in
// `lib/map/init.ts` so the icon swatch on a transport item is the same color
// as the line drawn on the map for that mode. Tailwind v4 reads these
// arbitrary class strings via JIT — keep them as literal strings, not
// concatenated, or JIT won't pick them up.
const SAME_DAY_STYLE: Record<SameDayTransportMode, { iconBg: string; iconText: string; border: string }> = {
  walk:    { iconBg: "bg-[#1e6fbf]/15", iconText: "text-[#1e6fbf]", border: "border-[#1e6fbf]/50" },
  bike:    { iconBg: "bg-[#2d8f4d]/15", iconText: "text-[#2d8f4d]", border: "border-[#2d8f4d]/50" },
  drive:   { iconBg: "bg-[#d97f3a]/15", iconText: "text-[#d97f3a]", border: "border-[#d97f3a]/50" },
  transit: { iconBg: "bg-[#7b3fa3]/15", iconText: "text-[#7b3fa3]", border: "border-[#7b3fa3]/50" },
};

const CROSS_CITY_ICON: Record<CrossCityTransportMode, typeof TrainFront> = {
  drive: Car,
  train: Train,
  bus: Bus,
  ferry: Sailboat,
  flight: Plane,
};

// Cross-city items use the map's intercity (brown) color for the icon and
// border, plus a tinted background panel to stand apart from same-day items.
const CROSS_CITY_ICON_BG = "bg-[#8a4a2a]/15";
const CROSS_CITY_ICON_TEXT = "text-[#8a4a2a]";
const CROSS_CITY_BORDER = "border-[#8a4a2a]/60";
const CROSS_CITY_PANEL_BG = "bg-[#8a4a2a]/5";

function isSameDayTransport(data: PlanItem["ai_data"]): data is SameDayTransportData {
  return Boolean(
    data
      && typeof data === "object"
      && "same_day_pair" in data
      && "mode" in data
      && "distance_meters" in data,
  );
}

function isCrossCityTransport(data: PlanItem["ai_data"]): data is CrossCityTransportData {
  return Boolean(
    data
      && typeof data === "object"
      && "cross_city_pair" in data
      && "mode" in data,
  );
}

export default function TransportCard({ item, onRemove, isHighlighted = false, onHoverChange }: Props) {
  const sameDayData = isSameDayTransport(item.ai_data) ? item.ai_data : null;
  const crossCityData = !sameDayData && isCrossCityTransport(item.ai_data) ? item.ai_data : null;

  let ModeIcon: typeof TrainFront = TrainFront;
  let modeLabel = item.title;
  const detailParts: string[] = [];

  if (sameDayData) {
    ModeIcon = SAME_DAY_ICON[sameDayData.mode];
    modeLabel = SAME_DAY_LABEL[sameDayData.mode];
    detailParts.push(formatDuration(sameDayData.duration_seconds));
    detailParts.push(formatDistance(sameDayData.distance_meters));
    if (sameDayData.transit_summary) detailParts.push(sameDayData.transit_summary);
  } else if (crossCityData) {
    ModeIcon = CROSS_CITY_ICON[crossCityData.mode] ?? TrainFront;
    modeLabel = item.title;
    if (crossCityData.duration_seconds != null) {
      detailParts.push(formatDuration(crossCityData.duration_seconds));
    }
    if (crossCityData.distance_meters != null) {
      detailParts.push(formatDistance(crossCityData.distance_meters));
    }
    if (crossCityData.transit_summary) detailParts.push(crossCityData.transit_summary);
  } else if (item.notes?.trim()) {
    detailParts.push(item.notes.trim());
  }

  const sameDayStyle = sameDayData ? SAME_DAY_STYLE[sameDayData.mode] : null;
  const isCrossCity = !!crossCityData;

  return (
    <div
      data-item-id={item.id}
      onMouseEnter={() => onHoverChange?.(item.id, true)}
      onMouseLeave={() => onHoverChange?.(item.id, false)}
      onFocus={() => onHoverChange?.(item.id, true)}
      onBlur={() => onHoverChange?.(item.id, false)}
      className={cn(
        "group flex items-center gap-3 rounded-lg",
        "ml-[1.125rem]",
        isCrossCity
          // Cross-city: roomier, tinted panel, dashed brown left border —
          // visually distinct from same-day so the eye treats it as a
          // city-to-city transition, not just another route within a city.
          // mt-3/mb-3 give breathing room from neighboring city sections.
          ? cn("mt-3 mb-3 py-2.5 pl-4 pr-2 border-l-2 border-dashed", CROSS_CITY_BORDER, CROSS_CITY_PANEL_BG)
          : cn("my-0.5 py-1.5 pl-4 pr-2 border-l-2", sameDayStyle ? sameDayStyle.border : "border-sky-500/40"),
        isHighlighted && "ring-1 ring-secondary/40 bg-secondary/10",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full",
          isCrossCity
            ? cn("size-8", CROSS_CITY_ICON_BG, CROSS_CITY_ICON_TEXT)
            : cn(
                "size-7",
                sameDayStyle ? sameDayStyle.iconBg : "bg-sky-500/15",
                sameDayStyle ? sameDayStyle.iconText : "text-sky-700 dark:text-sky-300",
              ),
        )}
      >
        <ModeIcon className={isCrossCity ? "size-4" : "size-3.5"} strokeWidth={1.75} />
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5",
          isCrossCity ? "text-sm" : "text-xs",
        )}
      >
        <span className="font-semibold text-ink">{modeLabel}</span>
        {isCrossCity && (
          <span className="inline-flex items-center rounded-full bg-[#8a4a2a]/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#8a4a2a]">
            Cross-city
          </span>
        )}
        {detailParts.length > 0 ? (
          <span className="text-ink-subtle">
            {detailParts.map((part, idx) => (
              <span key={idx}>
                {idx > 0 ? <span className="opacity-50"> · </span> : null}
                {part}
              </span>
            ))}
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${modeLabel} transport`}
        className="shrink-0 rounded-full p-1 text-ink-subtle hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="size-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}
