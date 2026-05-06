"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  enrichBatch,
  getNextSuggestion,
  getSuggestions,
  type AddItemPayload,
  type AiSuggestion,
  type DestinationResponse,
  type EnrichedItem,
  type PlanDay,
} from "@/lib/api";
import { isAbortError } from "@/lib/utils";

const BACKGROUND_ENRICH_CHUNK_SIZE = 5;
const PLACEHOLDER_SLUG_PREFIX = "placeholder:";

export interface SuggestionPlaceholder {
  placeholder: true;
  slug: string;
}

export type SuggestionSlot = AiSuggestion | SuggestionPlaceholder;

export function isPlaceholder(slot: SuggestionSlot): slot is SuggestionPlaceholder {
  return "placeholder" in slot;
}

let placeholderCounter = 0;
function makePlaceholder(): SuggestionPlaceholder {
  placeholderCounter += 1;
  return { placeholder: true, slug: `${PLACEHOLDER_SLUG_PREFIX}${placeholderCounter}` };
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().trim();
}

interface UseAiSuggestionsOptions {
  planId: string;
  onAddItem: (dayId: string, payload: AddItemPayload) => void;
  destinations: DestinationResponse[];
  days: PlanDay[];
  initialSuggestions?: AiSuggestion[] | null;
}

interface UseAiSuggestionsReturn {
  suggestions: SuggestionSlot[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  addingNames: Set<string>;
  addSuggestion: (suggestion: AiSuggestion, dayId: string) => Promise<void>;
  triggerEnrichment: () => void;
}

function resolveDestinationId(
  destinationCity: string | null,
  destinations: DestinationResponse[],
): string | undefined {
  if (!destinationCity) return undefined;
  const target = destinationCity.trim().toLowerCase();
  return destinations.find((d) => d.city.trim().toLowerCase() === target)?.id;
}

function realSuggestionNames(slots: SuggestionSlot[]): string[] {
  return slots.filter((s): s is AiSuggestion => !isPlaceholder(s)).map((s) => s.name);
}

function realSuggestionSlugs(slots: SuggestionSlot[]): string[] {
  return slots.filter((s): s is AiSuggestion => !isPlaceholder(s)).map((s) => s.slug);
}

export function useAiSuggestions({
  planId,
  onAddItem,
  destinations,
  days,
  initialSuggestions,
}: UseAiSuggestionsOptions): UseAiSuggestionsReturn {
  const [suggestions, setSuggestions] = useState<SuggestionSlot[]>(initialSuggestions ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingNames, setAddingNames] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const backgroundEnrichRef = useRef<AbortController | null>(null);
  const enrichedCacheRef = useRef<Map<string, EnrichedItem>>(new Map());
  // Promises for slugs currently being enriched by a background batch. Lets
  // the Add click latch onto the in-flight request instead of firing a
  // duplicate /ai/enrich-batch for the same slug.
  const inflightEnrichRef = useRef<Map<string, Promise<EnrichedItem>>>(new Map());
  // Idempotency guard for triggerEnrichment so a re-arm via the suggestions-
  // arrival effect, hover, and focus all coalesce into a single background
  // batch. Subsequent fetches (refresh, backfill) read this and short-circuit
  // through the existing armed branches in fetchSuggestions / backfillSlot.
  const enrichmentArmedRef = useRef(false);

  const existingItemTitles = useMemo(() => {
    const titles = new Set<string>();
    for (const day of days) {
      for (const item of day.items) {
        titles.add(normalizeTitle(item.title));
      }
    }
    return titles;
  }, [days]);

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
        const deferreds = new Map<
          string,
          { resolve: (value: EnrichedItem) => void; reject: (reason: unknown) => void }
        >();
        for (const s of chunk) {
          const promise = new Promise<EnrichedItem>((resolve, reject) => {
            deferreds.set(s.slug, { resolve, reject });
          });
          inflightEnrichRef.current.set(s.slug, promise);
          // Swallow unhandled rejection — the Add-click consumer attaches its
          // own catch lazily, and chunks where no one is waiting shouldn't
          // crash the page if the batch errors.
          promise.catch(() => {});
        }
        try {
          const results = await enrichBatch(request, signal);
          if (signal.aborted) {
            for (const d of deferreds.values()) {
              d.reject(new DOMException("aborted", "AbortError"));
            }
            return;
          }
          chunk.forEach((s, idx) => {
            const enriched = results[idx];
            if (enriched) {
              enrichedCacheRef.current.set(s.slug, enriched);
              deferreds.get(s.slug)?.resolve(enriched);
            } else {
              deferreds.get(s.slug)?.reject(new Error("enrichBatch returned empty slot"));
            }
          });
        } catch (err) {
          for (const d of deferreds.values()) d.reject(err);
          if (isAbortError(err)) return;
          // silent — Add click will fall back to inline enrichment
        } finally {
          for (const slug of deferreds.keys()) {
            inflightEnrichRef.current.delete(slug);
          }
        }
      }
    },
    [],
  );

  const backfillSlot = useCallback(
    async (placeholderSlug: string, excludeNames: string[], excludeSlugs: string[]) => {
      try {
        const next = await getNextSuggestion(planId, excludeNames, excludeSlugs);
        setSuggestions((prev) => {
          if (prev.some((s) => !isPlaceholder(s) && s.slug === next.slug)) {
            return prev.filter((slot) => !(isPlaceholder(slot) && slot.slug === placeholderSlug));
          }
          return prev.map((slot) =>
            isPlaceholder(slot) && slot.slug === placeholderSlug ? next : slot,
          );
        });
        if (enrichmentArmedRef.current && !next.enriched && next.destination_city) {
          const controller = new AbortController();
          void enrichInBackground([next], controller.signal);
        }
      } catch (err) {
        console.warn("AI suggestion backfill failed for slug=%s", placeholderSlug, err);
        setSuggestions((prev) =>
          prev.filter((slot) => !(isPlaceholder(slot) && slot.slug === placeholderSlug)),
        );
      }
    },
    [enrichInBackground, planId],
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

        if (enrichmentArmedRef.current) {
          const enrichController = new AbortController();
          backgroundEnrichRef.current = enrichController;
          void enrichInBackground(data.suggestions, enrichController.signal);
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
    [planId, enrichInBackground],
  );

  useEffect(() => {
    if (initialSuggestions != null) {
      if (enrichmentArmedRef.current) {
        const enrichController = new AbortController();
        backgroundEnrichRef.current = enrichController;
        void enrichInBackground(initialSuggestions, enrichController.signal);
        return () => {
          enrichController.abort();
        };
      }
      return;
    }
    fetchSuggestions();
    return () => {
      abortRef.current?.abort();
      backgroundEnrichRef.current?.abort();
    };
  }, [fetchSuggestions, enrichInBackground, initialSuggestions]);

  const suggestionsRef = useRef(suggestions);
  // Sync during render so the dedupe effect below reads the latest list, not
  // a render-old snapshot. Plain `useEffect(() => { ref = state })` would
  // run after the dedupe effect and leave it operating on stale data.
  suggestionsRef.current = suggestions;

  // Dedupe: when an itinerary item now matches an AI suggestion (user added
  // it manually via search, or the backend cache pre-dates the add), swap
  // that suggestion for a fresh one. Skip placeholders — those are already
  // mid-fetch. Placeholder creation lives outside `setSuggestions` so React
  // strict-mode's double-invoked setter doesn't queue duplicate backfills.
  useEffect(() => {
    if (existingItemTitles.size === 0) return;
    const current = suggestionsRef.current;

    type Match = { name: string; placeholder: SuggestionPlaceholder };
    const matches: Match[] = [];
    for (const slot of current) {
      if (isPlaceholder(slot)) continue;
      if (!existingItemTitles.has(normalizeTitle(slot.name))) continue;
      matches.push({ name: slot.name, placeholder: makePlaceholder() });
    }
    if (matches.length === 0) return;

    const matchedNames = new Set(matches.map((m) => m.name));
    const placeholderByName = new Map(matches.map((m) => [m.name, m.placeholder]));

    setSuggestions((prev) =>
      prev.map((slot) =>
        !isPlaceholder(slot) && placeholderByName.has(slot.name)
          ? (placeholderByName.get(slot.name) as SuggestionPlaceholder)
          : slot,
      ),
    );

    const remaining = current.filter(
      (slot): slot is AiSuggestion => !isPlaceholder(slot) && !matchedNames.has(slot.name),
    );
    const remainingNames = remaining.map((slot) => slot.name);
    const remainingSlugs = remaining.map((slot) => slot.slug);

    for (const match of matches) {
      void backfillSlot(match.placeholder.slug, [...remainingNames], [...remainingSlugs]);
    }
  }, [existingItemTitles, backfillSlot]);

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
          const inflight = inflightEnrichRef.current.get(suggestion.slug);
          if (inflight) {
            try {
              aiData = await inflight;
              enrichedCacheRef.current.set(suggestion.slug, aiData);
            } catch {
              // background batch failed for this slug — fall through to fresh enrichBatch
            }
          }
        }

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

        // Compute next state from the ref synchronously: a setSuggestions
        // updater would not run until React's next render flush, leaving the
        // exclude arrays empty when backfillSlot is called.
        const placeholder = makePlaceholder();
        const current = suggestionsRef.current;
        const next: SuggestionSlot[] = current.map((slot) =>
          !isPlaceholder(slot) && slot.name === suggestion.name ? placeholder : slot,
        );
        const excludeNamesForNext = realSuggestionNames(next);
        excludeNamesForNext.push(suggestion.name);
        const excludeSlugsForNext = realSuggestionSlugs(next);
        excludeSlugsForNext.push(suggestion.slug);
        setSuggestions(next);
        enrichedCacheRef.current.delete(suggestion.slug);

        await backfillSlot(placeholder.slug, excludeNamesForNext, excludeSlugsForNext);
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
    [backfillSlot, destinations, onAddItem],
  );

  const triggerEnrichment = useCallback(() => {
    if (enrichmentArmedRef.current) return;
    enrichmentArmedRef.current = true;
    const realSuggestions = suggestionsRef.current.filter(
      (slot): slot is AiSuggestion => !isPlaceholder(slot),
    );
    if (realSuggestions.length === 0) return;
    backgroundEnrichRef.current?.abort();
    const controller = new AbortController();
    backgroundEnrichRef.current = controller;
    void enrichInBackground(realSuggestions, controller.signal);
  }, [enrichInBackground]);

  // Eager-fire on suggestions arrival so enrichment overlaps with the user
  // reading the cards instead of waiting for hover/focus on the strip. Hover
  // and focus handlers stay as a no-op safety net via the dedupe guard.
  useEffect(() => {
    triggerEnrichment();
  }, [suggestions, triggerEnrichment]);

  return { suggestions, isLoading, error, refresh, addingNames, addSuggestion, triggerEnrichment };
}
