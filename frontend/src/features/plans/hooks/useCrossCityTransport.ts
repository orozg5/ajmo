"use client";

import { useCallback, useRef, useState } from "react";

import { getCrossCityTransportSuggestions, type AddItemPayload, type CrossCityMarker, type TransportSuggestion } from "@/lib/api";
import { isAbortError } from "@/lib/utils";

export interface UseCrossCityTransportOptions {
  planId: string;
}

export interface UseCrossCityTransportReturn {
  suggestions: TransportSuggestion[];
  isLoading: boolean;
  error: string | null;
  isOpen: boolean;
  hasFetched: boolean;
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
  const [hasFetched, setHasFetched] = useState(false);
  const [addingKeys, setAddingKeys] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const fetchSuggestions = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    try {
      const data = await getCrossCityTransportSuggestions(planId, controller.signal);
      if (!controller.signal.aborted) {
        setSuggestions(data.suggestions);
        setHasFetched(true);
      }
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
        const noteParts = [
          `From ${suggestion.source_item_title ?? suggestion.source_city ?? "?"} to ${suggestion.destination_item_title ?? suggestion.destination_city ?? "?"}`,
          option.one_line,
        ].filter(Boolean);

        // Store a cross_city_pair marker in ai_data so the backend can detect
        // this transition as covered on subsequent fetches.
        const pairKey =
          suggestion.source_item_id && suggestion.destination_item_id
            ? `${suggestion.source_item_id}->${suggestion.destination_item_id}`
            : `${suggestion.source_city}->${suggestion.destination_city}`;

        const payload: AddItemPayload = {
          item_type: "transport",
          title: option.name,
          notes: noteParts.join(" · "),
          location: suggestion.destination_item_location ?? undefined,
          destination_id: extra?.destinationId,
          sort_order: extra?.sortOrder,
          ai_data: { cross_city_pair: pairKey } satisfies CrossCityMarker,
        };
        await onAddItem(dayId, payload);
        // Remove from suggestions list so it disappears immediately in the panel.
        setSuggestions((prev) => prev.filter((s) => {
          const sKey = s.source_item_id && s.destination_item_id
            ? `${s.source_item_id}->${s.destination_item_id}`
            : `${s.source_city}->${s.destination_city}`;
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

  return { suggestions, isLoading, error, isOpen, hasFetched, fetchSuggestions, openPanel, closePanel, addingKeys, addOption };
}
