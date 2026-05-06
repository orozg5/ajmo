"use client";

import { useMemo } from "react";

import { type PlanDay, type PlanHotel, type PlanItem } from "@/lib/api";
import type { EnrichedItem } from "@/lib/api/ai";
import type { MapItem, RouteKind } from "@/lib/map/init";

import { sortItems } from "@/features/plans/utils/sortKeys";

export interface MapAdjacency {
  id: string;
  src: MapItem;
  dst: MapItem;
  kind: RouteKind;
  label?: string;
  geometry?: [number, number][];
}

export interface UseMapStateOptions {
  days: PlanDay[];
  hotels: PlanHotel[];
  activeDayId: string | null;
  filterMode: "all" | "active-day";
  allowedDestinationIds: Set<string> | null;
}

export interface UseMapStateReturn {
  markers: MapItem[];
  adjacencies: MapAdjacency[];
}

interface SameDayTransportAiData {
  same_day_pair?: string;
  mode?: "walk" | "bike" | "drive" | "transit";
  distance_meters?: number;
  duration_seconds?: number;
  transit_summary?: string;
  geometry?: [number, number][];
}

interface CrossCityTransportAiData {
  cross_city_pair?: string;
}

function hotelForDay(hotels: PlanHotel[], dayNumber: number): PlanHotel | null {
  for (const hotel of hotels) {
    if (
      typeof hotel.place_lat === "number" &&
      typeof hotel.place_lng === "number" &&
      dayNumber >= hotel.check_in_day_number &&
      dayNumber <= hotel.check_out_day_number
    ) {
      return hotel;
    }
  }
  return null;
}

function toHotelMarker(hotel: PlanHotel, dayNumber: number): MapItem {
  return {
    id: `hotel-${hotel.id}`,
    lat: hotel.place_lat as number,
    lng: hotel.place_lng as number,
    dayNumber,
    label: hotel.place_name ?? "Hotel",
    kind: "hotel",
  };
}

function hasCoordinates(item: PlanItem): item is PlanItem & { ai_data: EnrichedItem } {
  const data = item.ai_data;
  if (!data) return false;
  return (
    "lat" in data &&
    "lng" in data &&
    typeof (data as EnrichedItem).lat === "number" &&
    typeof (data as EnrichedItem).lng === "number"
  );
}

function toMarker(item: PlanItem, dayNumber: number): MapItem | null {
  if (!hasCoordinates(item)) return null;
  return {
    id: item.id,
    lat: (item.ai_data as EnrichedItem).lat!,
    lng: (item.ai_data as EnrichedItem).lng!,
    dayNumber,
    label: item.title,
  };
}

interface ParsedTransport {
  srcId: string;
  dstId: string;
  kind: RouteKind | null;
  geometry?: [number, number][];
}

function parseTransport(item: PlanItem): ParsedTransport | null {
  if (item.item_type !== "transport") return null;
  const ai = item.ai_data as (SameDayTransportAiData & CrossCityTransportAiData) | null;
  if (!ai) return null;

  if (ai.cross_city_pair) {
    const [srcId, dstId] = ai.cross_city_pair.split("->");
    if (!srcId || !dstId) return null;
    return { srcId, dstId, kind: "intercity" };
  }

  if (ai.same_day_pair) {
    const [srcId, dstId] = ai.same_day_pair.split("->");
    if (!srcId || !dstId) return null;
    const mode = ai.mode;
    if (mode === "walk" || mode === "bike" || mode === "drive") {
      return { srcId, dstId, kind: mode };
    }
    if (mode === "transit") {
      return { srcId, dstId, kind: "transit", geometry: ai.geometry };
    }
    // Legacy LLM-suggested same-day item without a deterministic mode — skip the line.
    return { srcId, dstId, kind: null };
  }

  return null;
}

export function useMapState({
  days,
  hotels,
  activeDayId,
  filterMode,
  allowedDestinationIds,
}: UseMapStateOptions): UseMapStateReturn {
  return useMemo(() => {
    const markers: MapItem[] = [];
    const markerById = new Map<string, MapItem>();
    const adjacencies: MapAdjacency[] = [];

    const visibleDays = filterMode === "active-day"
      ? days.filter((d) => d.id === activeDayId)
      : days;

    const emittedHotelIds = new Set<string>();

    const passesDestinationFilter = (item: PlanItem): boolean => {
      if (!allowedDestinationIds) return true;
      if (!item.destination_id) return true;
      return allowedDestinationIds.has(item.destination_id);
    };

    for (const day of visibleDays) {
      const dayItemsSorted = sortItems(day.items);

      for (const item of dayItemsSorted) {
        if (item.item_type === "transport") continue;
        if (!passesDestinationFilter(item)) continue;
        const marker = toMarker(item, day.day_number);
        if (!marker) continue;
        markers.push(marker);
        markerById.set(item.id, marker);
      }

      const hotel = hotelForDay(hotels, day.day_number);
      const hotelMarker = hotel ? toHotelMarker(hotel, day.day_number) : null;
      if (hotelMarker && !emittedHotelIds.has(hotelMarker.id)) {
        markers.push(hotelMarker);
        emittedHotelIds.add(hotelMarker.id);
      }
    }

    // Adjacencies span any day; transport item drives the line, src/dst markers
    // come from the marker map built above. Filter respects active-day mode by
    // requiring both endpoints to be in the visible marker set.
    for (const day of visibleDays) {
      for (const item of day.items) {
        const parsed = parseTransport(item);
        if (!parsed || !parsed.kind) continue;
        const src = markerById.get(parsed.srcId);
        const dst = markerById.get(parsed.dstId);
        if (!src || !dst) continue;
        adjacencies.push({
          id: item.id,
          src,
          dst,
          kind: parsed.kind,
          geometry: parsed.geometry,
        });
      }
    }

    return { markers, adjacencies };
  }, [days, hotels, activeDayId, filterMode, allowedDestinationIds]);
}
