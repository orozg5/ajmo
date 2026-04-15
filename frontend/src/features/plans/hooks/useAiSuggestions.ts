"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { enrichBatch, getNextSuggestion, getSuggestions, type AddItemPayload, type AiSuggestion, type EnrichedItem } from "@/lib/api";
import { isAbortError } from "@/lib/utils";

interface UseAiSuggestionsOptions {
  planId: string;
  onAddItem: (dayId: string, payload: AddItemPayload) => void;
  initialSuggestions?: AiSuggestion[] | null;
}

interface UseAiSuggestionsReturn {
  suggestions: AiSuggestion[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  addingNames: Set<string>;
  addSuggestion: (suggestion: AiSuggestion, dayId: string) => Promise<void>;
}

export function useAiSuggestions({ planId, onAddItem, initialSuggestions }: UseAiSuggestionsOptions): UseAiSuggestionsReturn {
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>(initialSuggestions ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingNames, setAddingNames] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const fetchSuggestions = useCallback(
    async (forceRefresh = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(null);
      try {
        const data = await getSuggestions(planId, forceRefresh, undefined, controller.signal);
        if (!controller.signal.aborted) {
          setSuggestions(data.suggestions);
        }
      } catch (err) {
        if (!isAbortError(err)) {
          setSuggestions([]);
          setError("AI suggestions are temporarily unavailable.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [planId],
  );

  useEffect(() => {
    if (initialSuggestions != null) return;
    fetchSuggestions();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchSuggestions, initialSuggestions]);

  const refresh = useCallback(() => {
    setSuggestions([]);
    fetchSuggestions(true);
  }, [fetchSuggestions]);

  const addSuggestion = useCallback(
    async (suggestion: AiSuggestion, dayId: string) => {
      setAddingNames((prev) => new Set(prev).add(suggestion.name));
      try {
        let aiData: EnrichedItem;
        if (suggestion.enriched) {
          aiData = suggestion.enriched;
        } else {
          const results = await enrichBatch([{ name: suggestion.name, destination: suggestion.destination_city ?? "", item_type: suggestion.item_type }]);
          if (!results[0]) throw new Error("enrichBatch returned empty");
          aiData = results[0];
        }
        const payload: AddItemPayload = {
          item_type: suggestion.item_type,
          title: suggestion.name,
          ai_data: aiData,
          location: aiData.location ?? undefined,
        };
        onAddItem(dayId, payload);

        // Remove added suggestion; capture remaining names synchronously
        let remainingNames: string[] = [];
        setSuggestions((prev) => {
          const next = prev.filter((s) => s.name !== suggestion.name);
          remainingNames = next.map((s) => s.name);
          return next;
        });

        // Append a replacement (silent on failure)
        try {
          const next = await getNextSuggestion(planId, remainingNames);
          setSuggestions((prev) => {
            if (prev.some((s) => s.slug === next.slug)) return prev;
            return [...prev, next];
          });
        } catch {
          // strip just doesn't grow
        }
      } catch {
        // silent — user can tap Add again
      } finally {
        setAddingNames((prev) => {
          const n = new Set(prev);
          n.delete(suggestion.name);
          return n;
        });
      }
    },
    [onAddItem, planId],
  );

  return { suggestions, isLoading, error, refresh, addingNames, addSuggestion };
}
