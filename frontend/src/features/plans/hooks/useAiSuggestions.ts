"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  enrichBatch,
  getNextSuggestion,
  getSuggestions,
  type AddItemPayload,
  type AiSuggestion,
  type DestinationResponse,
  type EnrichedItem,
} from "@/lib/api";
import { isAbortError } from "@/lib/utils";

const BACKGROUND_ENRICH_CHUNK_SIZE = 5;

interface UseAiSuggestionsOptions {
  planId: string;
  onAddItem: (dayId: string, payload: AddItemPayload) => void;
  destinations: DestinationResponse[];
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

function resolveDestinationId(
  destinationCity: string | null,
  destinations: DestinationResponse[],
): string | undefined {
  if (!destinationCity) return undefined;
  const target = destinationCity.trim().toLowerCase();
  return destinations.find((d) => d.city.trim().toLowerCase() === target)?.id;
}

export function useAiSuggestions({
  planId,
  onAddItem,
  destinations,
  initialSuggestions,
}: UseAiSuggestionsOptions): UseAiSuggestionsReturn {
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>(initialSuggestions ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingNames, setAddingNames] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const backgroundEnrichRef = useRef<AbortController | null>(null);
  const enrichedCacheRef = useRef<Map<string, EnrichedItem>>(new Map());

  const enrichInBackground = useCallback(
    async (items: AiSuggestion[], signal: AbortSignal) => {
      const pending = items.filter(
        (s) => !s.enriched && !enrichedCacheRef.current.has(s.slug) && s.destination_city,
      );
      if (pending.length === 0) return;

      for (let offset = 0; offset < pending.length; offset += BACKGROUND_ENRICH_CHUNK_SIZE) {
        if (signal.aborted) return;
        const chunk = pending.slice(offset, offset + BACKGROUND_ENRICH_CHUNK_SIZE);
        const request = chunk.map((s) => ({
          name: s.name,
          destination: s.destination_city ?? "",
          item_type: s.item_type,
        }));
        try {
          const results = await enrichBatch(request, signal);
          if (signal.aborted) return;
          chunk.forEach((s, idx) => {
            const enriched = results[idx];
            if (enriched) enrichedCacheRef.current.set(s.slug, enriched);
          });
        } catch (err) {
          if (isAbortError(err)) return;
          // silent — Add click will fall back to inline enrichment
        }
      }
    },
    [],
  );

  const fetchSuggestions = useCallback(
    async (forceRefresh = false) => {
      abortRef.current?.abort();
      backgroundEnrichRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(null);
      try {
        const data = await getSuggestions(planId, forceRefresh, undefined, controller.signal);
        if (controller.signal.aborted) return;
        setSuggestions(data.suggestions);

        const enrichController = new AbortController();
        backgroundEnrichRef.current = enrichController;
        void enrichInBackground(data.suggestions, enrichController.signal);
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
    [planId, enrichInBackground],
  );

  useEffect(() => {
    if (initialSuggestions != null) {
      const enrichController = new AbortController();
      backgroundEnrichRef.current = enrichController;
      void enrichInBackground(initialSuggestions, enrichController.signal);
      return () => {
        enrichController.abort();
      };
    }
    fetchSuggestions();
    return () => {
      abortRef.current?.abort();
      backgroundEnrichRef.current?.abort();
    };
  }, [fetchSuggestions, enrichInBackground, initialSuggestions]);

  const refresh = useCallback(() => {
    enrichedCacheRef.current.clear();
    setSuggestions([]);
    fetchSuggestions(true);
  }, [fetchSuggestions]);

  const addSuggestion = useCallback(
    async (suggestion: AiSuggestion, dayId: string) => {
      setAddingNames((prev) => new Set(prev).add(suggestion.name));
      try {
        let aiData: EnrichedItem | undefined =
          enrichedCacheRef.current.get(suggestion.slug) ?? suggestion.enriched ?? undefined;

        if (!aiData) {
          const results = await enrichBatch([
            {
              name: suggestion.name,
              destination: suggestion.destination_city ?? "",
              item_type: suggestion.item_type,
            },
          ]);
          if (!results[0]) throw new Error("enrichBatch returned empty");
          aiData = results[0];
          enrichedCacheRef.current.set(suggestion.slug, aiData);
        }

        const destinationId = resolveDestinationId(suggestion.destination_city, destinations);
        const payload: AddItemPayload = {
          item_type: suggestion.item_type,
          title: suggestion.name,
          ai_data: aiData,
          location: aiData.location ?? undefined,
          destination_id: destinationId,
        };
        onAddItem(dayId, payload);

        let remainingNames: string[] = [];
        setSuggestions((prev) => {
          const next = prev.filter((s) => s.name !== suggestion.name);
          remainingNames = next.map((s) => s.name);
          return next;
        });
        enrichedCacheRef.current.delete(suggestion.slug);

        try {
          const next = await getNextSuggestion(planId, remainingNames);
          setSuggestions((prev) => {
            if (prev.some((s) => s.slug === next.slug)) return prev;
            return [...prev, next];
          });
          if (!next.enriched && next.destination_city) {
            const enrichController = new AbortController();
            void enrichInBackground([next], enrichController.signal);
          }
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
    [destinations, enrichInBackground, onAddItem, planId],
  );

  return { suggestions, isLoading, error, refresh, addingNames, addSuggestion };
}
