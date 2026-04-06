"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { enrichBatch, getNextSuggestion, getSuggestions, type AddItemPayload, type AiSuggestion } from "@/lib/api";
import { parseCostFromPriceRange } from "@/lib/utils";

interface Props {
  planId: string;
  userId: string;
  destination: string;
  onAddItem: (dayId: string, payload: AddItemPayload) => void;
  initialSuggestions?: AiSuggestion[] | null;
}

export function useAiSuggestions({ planId, userId, destination, onAddItem, initialSuggestions }: Props) {
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>(initialSuggestions ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [addingNames, setAddingNames] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const fetchSuggestions = useCallback(
    async (forceRefresh = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      try {
        const data = await getSuggestions(planId, userId, forceRefresh, undefined, controller.signal);
        if (!controller.signal.aborted) {
          setSuggestions(data.suggestions);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [planId, userId],
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
        const results = await enrichBatch([{ name: suggestion.name, destination, item_type: suggestion.item_type }]);
        if (!results[0]) throw new Error("enrichBatch returned empty");
        const aiData = results[0] as unknown as Record<string, unknown>;
        const payload: AddItemPayload = {
          item_type: suggestion.item_type,
          title: suggestion.name,
          estimated_cost: parseCostFromPriceRange(aiData.price_range as string | null | undefined),
          ai_data: aiData,
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
          const next = await getNextSuggestion(planId, userId, remainingNames);
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
    [destination, onAddItem, planId, userId],
  );

  return { suggestions, isLoading, refresh, addingNames, addSuggestion };
}
