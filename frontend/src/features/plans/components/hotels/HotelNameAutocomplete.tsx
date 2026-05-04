"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type EnrichedItem, type PlaceSuggestion } from "@/lib/api";
import { useItemEnrichment } from "@/features/plans/hooks/useItemEnrichment";

interface HotelNameAutocompleteProps {
  value: string;
  onValueChange: (name: string) => void;
  enrichmentEnabled: boolean;
  destination: string;
  onEnrich: (data: EnrichedItem, name: string) => void;
  onResultChange: (result: EnrichedItem | null) => void;
  onFetchErrorChange: (error: Error | null) => void;
  inputId?: string;
}

export default function HotelNameAutocomplete({
  value,
  onValueChange,
  enrichmentEnabled,
  destination,
  onEnrich,
  onResultChange,
  onFetchErrorChange,
  inputId = "hotel-name",
}: HotelNameAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    handleNameChange,
    suggestions,
    showDropdown,
    handleDropdownVisibility,
    activeIndex,
    handleActiveIndexChange,
    result,
    isPending,
    fetchError,
    handleSelect,
  } = useItemEnrichment({
    destination,
    itemType: "hotel",
    onEnrich: (data, itemName) => onEnrich(data, itemName),
  });

  useEffect(() => {
    handleNameChange(enrichmentEnabled ? value : "");
    if (!value) {
      handleDropdownVisibility(false);
      handleActiveIndexChange(-1);
    }
  }, [value, enrichmentEnabled, handleNameChange, handleDropdownVisibility, handleActiveIndexChange]);

  useEffect(() => {
    onResultChange(result);
  }, [result, onResultChange]);

  useEffect(() => {
    onFetchErrorChange(fetchError);
  }, [fetchError, onFetchErrorChange]);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleDropdownVisibility(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [handleDropdownVisibility]);

  function handleSuggestionSelect(suggestion: PlaceSuggestion) {
    handleSelect(suggestion);
    onValueChange(suggestion.name);
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
      handleSuggestionSelect(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      handleDropdownVisibility(false);
      handleActiveIndexChange(-1);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <Input
        id={inputId}
        role="combobox"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 ? `hotel-suggestion-${activeIndex}` : undefined
        }
        placeholder="e.g. Hotel Lutetia"
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={200}
        className={isPending ? "pr-9" : ""}
      />
      {isPending && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
      )}
      {enrichmentEnabled && showDropdown && suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label="Hotel suggestions"
          className="absolute z-50 w-full mt-1 overflow-hidden rounded-md border bg-popover shadow-md py-1"
        >
          {suggestions.map((suggestion, i) => (
            <Button
              key={suggestion.slug}
              id={`hotel-suggestion-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              type="button"
              variant="ghost"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSuggestionSelect(suggestion);
              }}
              className={`w-full justify-start px-3 py-1.5 h-auto font-normal rounded-none ${
                i === activeIndex ? "bg-accent" : ""
              }`}
            >
              <span className="font-medium">{suggestion.name}</span>
              {suggestion.location && (
                <span className="ml-2 text-xs text-muted-foreground truncate">
                  {suggestion.location}
                </span>
              )}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
