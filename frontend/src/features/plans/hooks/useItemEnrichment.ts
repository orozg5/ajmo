"use client";

import { useState, useEffect, useRef } from "react";

import { enrichBatch, autocompletePlaces, type EnrichedItem, type PlaceSuggestion } from "@/lib/api";

interface UseItemEnrichmentOptions {
  destination: string;
  itemType: string;
  onEnrich?: (item: EnrichedItem, name: string, itemType: string) => void;
}

interface UseItemEnrichmentReturn {
  name: string;
  setName: (name: string) => void;
  suggestions: PlaceSuggestion[];
  showDropdown: boolean;
  setShowDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  activeIndex: number;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  result: EnrichedItem | null;
  isPending: boolean;
  fetchError: Error | null;
  handleSelect: (s: PlaceSuggestion) => void;
}

export function useItemEnrichment({
  destination,
  itemType,
  onEnrich,
}: UseItemEnrichmentOptions): UseItemEnrichmentReturn {
  const [name, setName] = useState("");
  const [result, setResult] = useState<EnrichedItem | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [fetchError, setFetchError] = useState<Error | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const enrichAbortRef = useRef<AbortController | null>(null);
  const autocompleteAbortRef = useRef<AbortController | null>(null);
  // skipDebounceRef: set to true before a programmatic setName so enrichment fires at 0ms delay
  const skipDebounceRef = useRef(false);
  // justSelectedRef: set to true before a programmatic setName so autocomplete skips the re-query
  const justSelectedRef = useRef(false);

  // ── Enrichment ──────────────────────────────────────────────────────────────

  async function doEnrich(itemName: string, signal: AbortSignal) {
    setIsPending(true);
    setFetchError(null);
    try {
      const results = await enrichBatch([{ name: itemName, destination, item_type: itemType }], signal);
      if (!results[0]) throw new Error("enrichBatch returned empty");
      const data = results[0];
      setResult(data);
      onEnrich?.(data, itemName, itemType);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setFetchError(e as Error);
    } finally {
      setIsPending(false);
    }
  }

  // ── Autocomplete (immediate — no debounce) ───────────────────────────────

  useEffect(() => {
    if (!name.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }

    autocompleteAbortRef.current?.abort();
    autocompleteAbortRef.current = new AbortController();
    const signal = autocompleteAbortRef.current.signal;

    autocompletePlaces(name, destination, itemType, signal)
      .then((data) => {
        if (signal.aborted) return;
        setSuggestions(data);
        setShowDropdown(data.length > 0);
        setActiveIndex(-1);
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setSuggestions([]);
      });

    return () => autocompleteAbortRef.current?.abort();
  }, [name, itemType, destination]);

  // ── Enrichment (700ms debounce, suppressed while dropdown is open) ────────

  useEffect(() => {
    if (!name.trim()) {
      setResult(null);
      setFetchError(null);
      return;
    }
    if (showDropdown) return; // wait for user to select from dropdown

    enrichAbortRef.current?.abort();
    enrichAbortRef.current = new AbortController();
    const signal = enrichAbortRef.current.signal;
    const delay = skipDebounceRef.current ? 0 : 700;
    skipDebounceRef.current = false;

    const timer = setTimeout(() => doEnrich(name, signal), delay);
    return () => {
      clearTimeout(timer);
      enrichAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, itemType, destination, showDropdown]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSelect(s: PlaceSuggestion) {
    justSelectedRef.current = true; // skip autocomplete re-query
    skipDebounceRef.current = true; // fire enrichment immediately
    setName(s.name);
    setSuggestions([]);
    setShowDropdown(false);
    setActiveIndex(-1);
  }

  return {
    name,
    setName,
    suggestions,
    showDropdown,
    setShowDropdown,
    activeIndex,
    setActiveIndex,
    result,
    isPending,
    fetchError,
    handleSelect,
  };
}
