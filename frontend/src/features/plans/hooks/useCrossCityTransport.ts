"use client";

import { useCallback, useRef, useState } from "react";

import {
  streamCrossCityTransportSuggestions,
  type AddItemPayload,
  type CrossCityTransportData,
  type TransportSuggestion,
} from "@/lib/api";
import { isAbortError } from "@/lib/utils";
import {
  formatDistance,
  formatDuration,
} from "@/features/plans/utils/transportFormat";

export interface UseCrossCityTransportOptions {
  planId: string;
}

export interface UseCrossCityTransportReturn {
  suggestions: TransportSuggestion[];
  isLoading: boolean;
  error: string | null;
  isOpen: boolean;
  fetchSuggestions: () => Promise<void>;
  openPanel: () => void;
  closePanel: () => void;
  addingKeys: Set<string>;
  addOption: (
    suggestion: TransportSuggestion,
    optionIndex: number,
    dayId: string,
    onAddItem: (dayId: string, payload: AddItemPayload) => Promise<unknown>,
    extra?: { destinationId?: string; sortOrder?: number },
  ) => Promise<void>;
}

export function useCrossCityTransport({ planId }: UseCrossCityTransportOptions): UseCrossCityTransportReturn {
  const [suggestions, setSuggestions] = useState<TransportSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [addingKeys, setAddingKeys] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const fetchSuggestions = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    setSuggestions([]);
    try {
      await streamCrossCityTransportSuggestions(
        planId,
        (pair) => {
          if (controller.signal.aborted) return;
          setSuggestions((prev) => [...prev, pair]);
        },
        controller.signal,
      );
    } catch (err) {
      if (!isAbortError(err)) {
        setError("Cross-city transport suggestions are temporarily unavailable.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [planId]);

  const openPanel = useCallback(() => setIsOpen(true), []);
  const closePanel = useCallback(() => setIsOpen(false), []);

  const addOption = useCallback(
    async (
      suggestion: TransportSuggestion,
      optionIndex: number,
      dayId: string,
      onAddItem: (dayId: string, payload: AddItemPayload) => Promise<unknown>,
      extra?: { destinationId?: string; sortOrder?: number },
    ) => {
      const option = suggestion.options[optionIndex];
      if (!option) return;

      const key = `${suggestion.source_item_id}-${suggestion.destination_item_id}`;
      setAddingKeys((prev) => new Set(prev).add(key));

      try {
        const summaryParts: string[] = [];
        if (option.duration_seconds != null) summaryParts.push(formatDuration(option.duration_seconds));
        if (option.distance_meters != null) summaryParts.push(formatDistance(option.distance_meters));
        if (option.transit_summary) summaryParts.push(option.transit_summary);

        const noteParts = [
          `From ${suggestion.source_item_title ?? suggestion.source_city ?? "?"} to ${suggestion.destination_item_title ?? suggestion.destination_city ?? "?"}`,
          summaryParts.join(" · ") || null,
        ].filter(Boolean) as string[];

        // Keyed by (source_destination_id -> destination_destination_id) so the
        // backend can dedup the same way it builds candidate pairs. Carrying
        // both destination ids on the item also lets DayView decide whether
        // this transport is an arrival or departure for a given section
        // without inferring direction from sort_order.
        if (!suggestion.source_destination_id || !suggestion.destination_destination_id) {
          throw new Error("Cross-city suggestion is missing destination ids");
        }
        const pairKey = `${suggestion.source_destination_id}->${suggestion.destination_destination_id}`;

        const aiData: CrossCityTransportData = {
          cross_city_pair: pairKey,
          source_destination_id: suggestion.source_destination_id,
          destination_destination_id: suggestion.destination_destination_id,
          mode: option.mode,
          duration_seconds: option.duration_seconds,
          distance_meters: option.distance_meters,
          is_estimate: option.is_estimate,
          transit_summary: option.transit_summary,
        };

        const payload: AddItemPayload = {
          item_type: "transport",
          title: option.name,
          notes: noteParts.join(" · "),
          location: suggestion.destination_item_location ?? undefined,
          destination_id: extra?.destinationId,
          sort_order: extra?.sortOrder,
          ai_data: aiData,
        };
        await onAddItem(dayId, payload);
        // Remove from suggestions list so it disappears immediately in the panel.
        setSuggestions((prev) => prev.filter((s) => {
          const sKey = `${s.source_destination_id}->${s.destination_destination_id}`;
          return sKey !== pairKey;
        }));
      } finally {
        setAddingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [],
  );

  return { suggestions, isLoading, error, isOpen, fetchSuggestions, openPanel, closePanel, addingKeys, addOption };
}
