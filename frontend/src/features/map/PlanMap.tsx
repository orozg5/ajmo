"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { Focus, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
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

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={filterMode === "all" ? "default" : "outline"}
          onClick={() => setFilterMode("all")}
        >
          <Layers className="size-4" strokeWidth={1.5} />
          All days
        </Button>
        <Button
          size="sm"
          variant={filterMode === "active-day" ? "default" : "outline"}
          onClick={() => setFilterMode("active-day")}
          disabled={!activeDayId}
        >
          Active day only
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => controllerRef.current?.fitToItems()}
          disabled={markers.length === 0}
        >
          <Focus className="size-4" strokeWidth={1.5} />
          Fit
        </Button>
      </div>

      {destinations.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {destinations.map((dest) => {
            const active = !excludedDestinationIds.has(dest.id);
            return (
              <button
                key={dest.id}
                type="button"
                onClick={() => toggleDestination(dest.id)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-surface text-ink-subtle"
                }`}
              >
                {dest.city}
              </button>
            );
          })}
        </div>
      )}

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
