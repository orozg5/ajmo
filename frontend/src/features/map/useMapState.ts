"use client";

import { useMemo } from "react";

import { type PlanDay, type PlanHotel, type PlanItem } from "@/lib/api";
import type { EnrichedItem } from "@/lib/api/ai";
import type { MapItem } from "@/lib/map/init";

import { sortItems } from "@/features/plans/utils/sortKeys";

export interface MapAdjacency {
  id: string;
  src: MapItem;
  dst: MapItem;
  kind: "walk" | "transit";
  label?: string;
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

export function useMapState({
  days,
  hotels,
  activeDayId,
  filterMode,
  allowedDestinationIds,
}: UseMapStateOptions): UseMapStateReturn {
  return useMemo(() => {
    const markers: MapItem[] = [];
    const adjacencies: MapAdjacency[] = [];

    const visibleDays = filterMode === "active-day"
      ? days.filter((d) => d.id === activeDayId)
      : days;

    const emittedHotelIds = new Set<string>();

    for (const day of visibleDays) {
      const itemsWithCoords = sortItems(day.items)
        .filter((item) => item.item_type !== "transport")
        .filter((item) => {
          if (!allowedDestinationIds) return true;
          if (!item.destination_id) return true;
          return allowedDestinationIds.has(item.destination_id);
        })
        .filter(hasCoordinates);

      const dayMarkers = itemsWithCoords
        .map((item) => toMarker(item, day.day_number))
        .filter((marker): marker is MapItem => marker !== null);

      markers.push(...dayMarkers);

      const hotel = hotelForDay(hotels, day.day_number);
      const hotelMarker = hotel ? toHotelMarker(hotel, day.day_number) : null;
      if (hotelMarker && !emittedHotelIds.has(hotelMarker.id)) {
        markers.push(hotelMarker);
        emittedHotelIds.add(hotelMarker.id);
      }

      for (let i = 0; i < itemsWithCoords.length - 1; i++) {
        const src = itemsWithCoords[i];
        const dst = itemsWithCoords[i + 1];
        const sameDestination =
          src.destination_id && dst.destination_id && src.destination_id === dst.destination_id;
        adjacencies.push({
          id: `${src.id}__${dst.id}`,
          src: dayMarkers[i],
          dst: dayMarkers[i + 1],
          kind: sameDestination ? "walk" : "transit",
        });
      }

      if (hotelMarker && dayMarkers.length > 0) {
        const firstMarker = dayMarkers[0];
        const lastMarker = dayMarkers[dayMarkers.length - 1];
        adjacencies.push({
          id: `${hotelMarker.id}__${firstMarker.id}`,
          src: hotelMarker,
          dst: firstMarker,
          kind: "walk",
        });
        if (dayMarkers.length > 1) {
          adjacencies.push({
            id: `${lastMarker.id}__${hotelMarker.id}`,
            src: lastMarker,
            dst: hotelMarker,
            kind: "walk",
          });
        }
      }
    }

    return { markers, adjacencies };
  }, [days, hotels, activeDayId, filterMode, allowedDestinationIds]);
}
