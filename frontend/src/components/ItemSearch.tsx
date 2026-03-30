"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { type EnrichedItem } from "@/lib/api";
import { useItemEnrichment } from "@/hooks/useItemEnrichment";

const ITEM_TYPES = [
  { value: "attraction", label: "Attraction", placeholder: "e.g. Eiffel Tower" },
  { value: "restaurant", label: "Restaurant", placeholder: "e.g. Le Jules Verne" },
  { value: "hotel", label: "Hotel", placeholder: "e.g. Hotel Lutetia" },
  { value: "transport", label: "Transport", placeholder: "e.g. Eurostar Paris–London" },
  { value: "activity", label: "Activity", placeholder: "e.g. Seine River Cruise" },
] as const;

// Update this map to change display labels for enriched fields.
// Keys must match the EnrichedItem interface in api.ts.
const FIELD_LABELS: Partial<Record<keyof EnrichedItem, string>> = {
  description: "Description",
  opening_hours: "Hours",
  price_range: "Price",
  cuisine: "Cuisine",
  reservation_tips: "Reservation tips",
  amenities: "Amenities",
  check_in_time: "Check-in",
  booking_tips: "Booking tips",
  schedule: "Schedule",
  duration: "Duration",
  tips: "Tips",
};

interface Props {
  destination: string;
  onEnrich?: (item: EnrichedItem, name: string, itemType: string) => void;
}

export default function ItemSearch({ destination, onEnrich }: Props) {
  const [itemType, setItemType] = useState<string>("attraction");
  const containerRef = useRef<HTMLDivElement>(null);

  const {
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
  } = useItemEnrichment({ destination, itemType, onEnrich });

  const activePlaceholder = ITEM_TYPES.find((t) => t.value === itemType)?.placeholder ?? "Item name";

  // ── Click outside ─────────────────────────────────────────────────────────

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [setShowDropdown]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleTabChange(val: string) {
    setItemType(val);
    setName("");
    setShowDropdown(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setActiveIndex(-1);
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
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
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

              <CardContent className="space-y-2 text-sm">
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
