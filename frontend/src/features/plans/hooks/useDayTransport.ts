"use client";

import { useCallback, useRef, useState } from "react";

import { getDayTransportSuggestions, type AddItemPayload, type PlanItem, type TransportSuggestion } from "@/lib/api";
import { isAbortError } from "@/lib/utils";

interface DayTransportState {
  suggestions: Map<string, TransportSuggestion>;
  isLoading: boolean;
  error: string | null;
}

export interface UseDayTransportOptions {
  planId: string;
}

export interface UseDayTransportReturn {
  getDayState: (dayId: string) => DayTransportState;
  fetchForDay: (dayId: string) => Promise<void>;
  addingKeys: Set<string>;
  addOption: (
    suggestion: TransportSuggestion,
    optionIndex: number,
    dayId: string,
    onAddItem: (dayId: string, payload: AddItemPayload) => Promise<PlanItem>,
    extra?: { destinationId?: string; sortOrder?: number },
  ) => Promise<void>;
  dismissSuggestion: (dayId: string, sourceItemId: string) => void;
  transportPositions: Map<string, string>;
}

const EMPTY_STATE: DayTransportState = {
  suggestions: new Map(),
  isLoading: false,
  error: null,
};

export function useDayTransport({ planId }: UseDayTransportOptions): UseDayTransportReturn {
  const [dayStates, setDayStates] = useState<Map<string, DayTransportState>>(new Map());
  const [addingKeys, setAddingKeys] = useState<Set<string>>(new Set());
  const [transportPositions, setTransportPositions] = useState<Map<string, string>>(new Map());
  const [dismissedPairKeys, setDismissedPairKeys] = useState<Set<string>>(new Set());
  const abortRefs = useRef<Map<string, AbortController>>(new Map());

  const getDayState = useCallback(
    (dayId: string): DayTransportState => dayStates.get(dayId) ?? EMPTY_STATE,
    [dayStates],
  );

  const setDayStatePartial = useCallback(
    (dayId: string, partial: Partial<DayTransportState>) => {
      setDayStates((prev) => {
        const next = new Map(prev);
        const existing = prev.get(dayId) ?? EMPTY_STATE;
        next.set(dayId, { ...existing, ...partial });
        return next;
      });
    },
    [],
  );

  const fetchForDay = useCallback(
    async (dayId: string) => {
      abortRefs.current.get(dayId)?.abort();
      const controller = new AbortController();
      abortRefs.current.set(dayId, controller);

      setDayStatePartial(dayId, { isLoading: true, error: null });

      try {
        const data = await getDayTransportSuggestions(planId, dayId, controller.signal);
        if (controller.signal.aborted) return;

        // Index by source_item_id, excluding pairs the user has already added this session.
        const currentDismissed = dismissedPairKeys;
        const indexed = new Map<string, TransportSuggestion>();
        for (const s of data.suggestions) {
          if (!s.source_item_id) continue;
          const key = `${s.source_item_id}-${s.destination_item_id}`;
          if (!currentDismissed.has(key)) {
            indexed.set(s.source_item_id, s);
          }
        }
        setDayStatePartial(dayId, { suggestions: indexed, isLoading: false });
      } catch (err) {
        if (!isAbortError(err)) {
          setDayStatePartial(dayId, {
            error: "Transport suggestions unavailable.",
            isLoading: false,
          });
        }
      }
    },
    [planId, setDayStatePartial, dismissedPairKeys],
  );

  const dismissSuggestion = useCallback(
    (dayId: string, sourceItemId: string) => {
      setDayStates((prev) => {
        const state = prev.get(dayId);
        if (!state) return prev;
        const newMap = new Map(state.suggestions);
        newMap.delete(sourceItemId);
        const next = new Map(prev);
        next.set(dayId, { ...state, suggestions: newMap });
        return next;
      });
    },
    [],
  );

  const addOption = useCallback(
    async (
      suggestion: TransportSuggestion,
      optionIndex: number,
      dayId: string,
      onAddItem: (dayId: string, payload: AddItemPayload) => Promise<PlanItem>,
      extra?: { destinationId?: string; sortOrder?: number },
    ) => {
      const option = suggestion.options[optionIndex];
      if (!option || !suggestion.source_item_id) return;

      const key = `${suggestion.source_item_id}-${suggestion.destination_item_id}`;
      setAddingKeys((prev) => new Set(prev).add(key));

      try {
        const noteParts = [
          `From ${suggestion.source_item_title ?? "?"} to ${suggestion.destination_item_title ?? "?"}`,
          option.one_line,
        ].filter(Boolean);

        const payload: AddItemPayload = {
          item_type: "transport",
          title: option.name,
          notes: noteParts.join(" · "),
          location: suggestion.destination_item_location ?? undefined,
          destination_id: extra?.destinationId,
          sort_order: extra?.sortOrder,
        };
        const newItem = await onAddItem(dayId, payload);
        // Track position in-session so DayView renders it after its source item immediately.
        setTransportPositions((prev) => {
          const next = new Map(prev);
          next.set(newItem.id, suggestion.source_item_id!);
          return next;
        });
        // Permanently dismiss this pair — don't re-show it even if the backend cache returns it.
        setDismissedPairKeys((prev) => new Set(prev).add(key));
        dismissSuggestion(dayId, suggestion.source_item_id);
      } finally {
        setAddingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [dismissSuggestion],
  );

  return { getDayState, fetchForDay, addingKeys, addOption, dismissSuggestion, transportPositions };
}
