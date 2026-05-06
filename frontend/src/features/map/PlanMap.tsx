"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Focus, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DestinationResponse, PlanDay, PlanHotel } from "@/lib/api";
import { createPlanMap, type PlanMapController } from "@/lib/map/init";

import { useMapState } from "@/features/map/useMapState";
import { useRoutes } from "@/features/map/useRoutes";

export interface PlanMapProps {
  days: PlanDay[];
  hotels: PlanHotel[];
  activeDayId: string | null;
  destinations: DestinationResponse[];
  highlightedItemId: string | null;
  onItemHover: (itemId: string | null) => void;
  onItemClick: (itemId: string) => void;
}

export default function PlanMap({
  days,
  hotels,
  activeDayId,
  destinations,
  highlightedItemId,
  onItemHover,
  onItemClick,
}: PlanMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<PlanMapController | null>(null);
  const hoverCallbackRef = useRef(onItemHover);
  const clickCallbackRef = useRef(onItemClick);

  useEffect(() => {
    hoverCallbackRef.current = onItemHover;
    clickCallbackRef.current = onItemClick;
  });

  const [filterMode, setFilterMode] = useState<"all" | "active-day">("all");
  const [excludedDestinationIds, setExcludedDestinationIds] = useState<Set<string>>(
    () => new Set(),
  );

  const allowedDestinationIds = useMemo(() => {
    if (destinations.length === 0) return null;
    const allowed = new Set<string>();
    let hasExcluded = false;
    for (const dest of destinations) {
      if (excludedDestinationIds.has(dest.id)) {
        hasExcluded = true;
      } else {
        allowed.add(dest.id);
      }
    }
    if (!hasExcluded) return null;
    return allowed;
  }, [destinations, excludedDestinationIds]);

  const { markers, adjacencies } = useMapState({
    days,
    hotels,
    activeDayId,
    filterMode,
    allowedDestinationIds,
  });

  const { routes } = useRoutes({ adjacencies });

  useEffect(() => {
    if (!containerRef.current) return;
    const controller = createPlanMap(containerRef.current, {
      onHover: (id) => hoverCallbackRef.current(id),
      onClick: (id) => {
        controllerRef.current?.focusItem(id);
        clickCallbackRef.current(id);
      },
    });
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setItems(markers);
  }, [markers]);

  useEffect(() => {
    controllerRef.current?.setRoutes(routes);
  }, [routes]);

  useEffect(() => {
    controllerRef.current?.setHighlight(highlightedItemId);
  }, [highlightedItemId]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || markers.length === 0) return;
    void controller.ready.then(() => {
      controller.fitToItems();
    });
  }, [markers.length]);

  function toggleDestination(id: string) {
    setExcludedDestinationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleDestinationCount = destinations.length - excludedDestinationIds.size;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Map day filter"
          className="inline-flex rounded-full border border-border bg-card p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filterMode === "all"}
            onClick={() => setFilterMode("all")}
            className={cn(
              "cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filterMode === "all"
                ? "bg-primary/10 text-primary"
                : "text-ink-subtle hover:text-ink",
            )}
          >
            All days
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filterMode === "active-day"}
            onClick={() => setFilterMode("active-day")}
            disabled={!activeDayId}
            className={cn(
              "cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filterMode === "active-day"
                ? "bg-primary/10 text-primary"
                : "text-ink-subtle hover:text-ink",
              !activeDayId && "cursor-not-allowed opacity-40",
            )}
          >
            Active day only
          </button>
        </div>

        {destinations.length > 1 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="cursor-pointer gap-1.5"
              >
                <MapPin className="size-3.5" strokeWidth={1.5} />
                Cities
                <span className="text-ink-subtle">
                  {visibleDestinationCount}/{destinations.length}
                </span>
                <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.5} />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56">
              <div className="flex flex-col gap-1">
                {destinations.map((dest) => {
                  const active = !excludedDestinationIds.has(dest.id);
                  return (
                    <label
                      key={dest.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleDestination(dest.id)}
                        className="size-4 cursor-pointer accent-primary"
                      />
                      <span className="flex-1">{dest.city}</span>
                      <span className="text-xs text-ink-subtle">{dest.country}</span>
                    </label>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto cursor-pointer"
              onClick={() => controllerRef.current?.fitToItems()}
              disabled={markers.length === 0}
              aria-label="Re-center map on items"
            >
              <Focus className="size-4" strokeWidth={1.5} />
              Fit
            </Button>
          </TooltipTrigger>
          <TooltipContent>Re-center on items</TooltipContent>
        </Tooltip>
      </div>

      <div
        ref={containerRef}
        className="flex-1 min-h-[360px] overflow-hidden rounded-xl border border-border bg-muted"
      />

      {markers.length === 0 && (
        <p className="text-xs text-ink-subtle">
          Items appear here once they have coordinates. Save an AI-enriched place to see it on the map.
        </p>
      )}
    </div>
  );
}
