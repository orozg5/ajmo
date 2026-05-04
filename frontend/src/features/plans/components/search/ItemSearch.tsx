"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import Image from "next/image";
import { ImageOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { enrichItem, type EnrichedItem } from "@/lib/api";
import { useItemEnrichment } from "@/features/plans/hooks/useItemEnrichment";
import { FIELD_LABELS } from "@/features/plans/utils/fieldLabels";

const PREFETCH_DWELL_MS = 150;

const ITEM_TYPES = [
  { value: "attraction", label: "Attraction", placeholder: "e.g. Eiffel Tower" },
  { value: "restaurant", label: "Restaurant", placeholder: "e.g. Le Jules Verne" },
  { value: "activity", label: "Activity", placeholder: "e.g. Seine River Cruise" },
] as const;

interface Props {
  destination: string;
  onEnrich?: (item: EnrichedItem, name: string, itemType: string) => void;
}

export default function ItemSearch({ destination, onEnrich }: Props) {
  const [itemType, setItemType] = useState<string>("attraction");
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    name,
    suggestions,
    showDropdown,
    activeIndex,
    handleActiveIndexChange,
    result,
    isPending,
    fetchError,
    handleSelect,
    handleNameChange,
    handleDropdownVisibility,
  } = useItemEnrichment({ destination, itemType, onEnrich });

  const activePlaceholder = ITEM_TYPES.find((t) => t.value === itemType)?.placeholder ?? "Item name";

  // ── Click outside ─────────────────────────────────────────────────────────

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleDropdownVisibility(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [handleDropdownVisibility]);

  // ── Speculative prefetch ─────────────────────────────────────────────────
  // Hovering a suggestion for 150ms fires the enrichment call so the backend
  // cache is warm by the time the user actually selects it. Cancelled if the
  // pointer leaves before the dwell window elapses.

  function handleSuggestionMouseEnter(suggestionName: string) {
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    prefetchTimerRef.current = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ["enrich", suggestionName, destination, itemType],
        queryFn: ({ signal }) => enrichItem(suggestionName, destination, itemType, signal),
        staleTime: 60_000,
      });
    }, PREFETCH_DWELL_MS);
  }

  function handleSuggestionMouseLeave() {
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
  }

  useEffect(() => () => {
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleTabChange(val: string) {
    setItemType(val);
    handleNameChange("");
    handleDropdownVisibility(false);
    handleActiveIndexChange(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      handleActiveIndexChange((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      handleActiveIndexChange((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      handleDropdownVisibility(false);
      handleActiveIndexChange(-1);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Tabs value={itemType} onValueChange={handleTabChange}>
      <TabsList>
        {ITEM_TYPES.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {ITEM_TYPES.map((t) => (
        <TabsContent key={t.value} value={t.value} className="space-y-4">
          <div className="relative" ref={containerRef}>
            <Input
              role="combobox"
              aria-expanded={showDropdown}
              aria-haspopup="listbox"
              aria-autocomplete="list"
              aria-activedescendant={activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined}
              placeholder={activePlaceholder}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={200}
              className={isPending ? "pr-9" : ""}
            />

            {isPending && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}

            {showDropdown && suggestions.length > 0 && (
              <div
                role="listbox"
                aria-label="Place suggestions"
                className="absolute z-50 w-full mt-1 overflow-hidden rounded-md border bg-popover shadow-md py-1"
              >
                {suggestions.map((s, i) => (
                  <Button
                    key={s.slug}
                    id={`suggestion-${i}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    variant="ghost"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(s);
                    }}
                    onMouseEnter={() => handleSuggestionMouseEnter(s.name)}
                    onMouseLeave={handleSuggestionMouseLeave}
                    className={`w-full justify-start px-3 py-1.5 h-auto font-normal rounded-none ${i === activeIndex ? "bg-accent" : ""}`}
                  >
                    <span className="font-medium">{s.name}</span>
                    {s.location && <span className="ml-2 text-xs text-muted-foreground truncate">{s.location}</span>}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {fetchError !== null && <p className="text-sm text-destructive">{fetchError.message}</p>}

          {result && (
            <Card>
              <CardHeader>
                <CardTitle>{t.label} details</CardTitle>
              </CardHeader>

              <CardContent className="space-y-3 text-sm">
                <div className="h-40 w-full overflow-hidden rounded-xl border border-border bg-muted">
                  {result.image_url ? (
                    <Image
                      src={result.image_url}
                      alt={name}
                      width={640}
                      height={320}
                      className="size-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-ink-subtle">
                      <ImageOff className="size-8" strokeWidth={1.5} />
                    </div>
                  )}
                </div>

                {(Object.entries(FIELD_LABELS) as [keyof EnrichedItem, string][]).map(([field, label]) => {
                  const value = result[field];
                  if (value == null) return null;

                  if (Array.isArray(value) && value.length === 0) return null;

                  if (Array.isArray(value)) {
                    return (
                      <div key={field}>
                        <p className="font-medium mb-1">{label}:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {value.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  }

                  return (
                    <p key={field}>
                      <span className="font-medium">{label}:</span> {value}
                    </p>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
