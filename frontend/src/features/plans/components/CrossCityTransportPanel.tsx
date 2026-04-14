"use client";

import { useState } from "react";

import { Loader2, Train } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type DestinationResponse, type PlanDay, type TransportSuggestion } from "@/lib/api";

type ExtraPayload = { destinationId?: string; sortOrder?: number };

function computeExtraPayload(selectedDay: PlanDay, suggestion: TransportSuggestion): ExtraPayload {
  const dayItems = selectedDay.items;
  const maxSort = dayItems.reduce((m, i) => Math.max(m, i.sort_order ?? 0), 0);
  const minSortRaw = dayItems.reduce((m, i) => Math.min(m, i.sort_order ?? Infinity), Infinity);
  const minSort = isFinite(minSortRaw) ? minSortRaw : 0;

  const isSameDay =
    suggestion.source_day_number != null &&
    suggestion.source_day_number === suggestion.destination_day_number;

  if (isSameDay) {
    // Both cities on the same day: place transport BETWEEN the two sections.
    // Null destination_id + midpoint sort_order causes DayView to render the card
    // between the two city sections (slot-based render).
    const srcItem = dayItems.find((i) => i.id === suggestion.source_item_id);
    const dstItem = dayItems.find((i) => i.id === suggestion.destination_item_id);
    const srcSort = srcItem?.sort_order ?? maxSort;
    const dstSort = dstItem?.sort_order ?? maxSort + 1000;
    return { destinationId: undefined, sortOrder: Math.floor((srcSort + dstSort) / 2) };
  }

  if (selectedDay.day_number === suggestion.source_day_number) {
    // Source day: place at the end of the source-city section as a departure.
    const sourceItem = dayItems.find((i) => i.id === suggestion.source_item_id);
    return { destinationId: sourceItem?.destination_id ?? undefined, sortOrder: maxSort + 1000 };
  }

  if (selectedDay.day_number === suggestion.destination_day_number) {
    // Destination day: place at the beginning of the destination-city section as an arrival.
    const destItem = dayItems.find((i) => i.id === suggestion.destination_item_id);
    return { destinationId: destItem?.destination_id ?? undefined, sortOrder: minSort - 1000 };
  }

  // Transit day (neither source nor destination day): place at the end with no destination.
  return { destinationId: undefined, sortOrder: maxSort + 1000 };
}

interface CrossCityTransportPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: TransportSuggestion[];
  isLoading: boolean;
  error: string | null;
  days: PlanDay[];
  destinations: DestinationResponse[];
  addingKeys: Set<string>;
  onAddOption: (suggestion: TransportSuggestion, optionIndex: number, dayId: string, extra?: ExtraPayload) => void;
}

export default function CrossCityTransportPanel({
  open,
  onOpenChange,
  suggestions,
  isLoading,
  error,
  days,
  destinations,
  addingKeys,
  onAddOption,
}: CrossCityTransportPanelProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Train className="h-4 w-4" />
            Cross-city Transport
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Finding transport options...</span>
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive text-center py-4">{error}</div>
        )}

        {!isLoading && !error && suggestions.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">
            No cross-city transitions found. Add items to multiple destinations to get started.
          </div>
        )}

        {!isLoading && !error && suggestions.length > 0 && (
          <div className="space-y-4">
            {suggestions.map((suggestion) => {
              const pairKey = `${suggestion.source_item_id ?? "?"}-${suggestion.destination_item_id ?? "?"}`;
              return (
                <SuggestionCard
                  key={pairKey}
                  suggestion={suggestion}
                  days={days}
                  destinations={destinations}
                  isAdding={addingKeys.has(pairKey)}
                  onAddOption={onAddOption}
                />
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface SuggestionCardProps {
  suggestion: TransportSuggestion;
  days: PlanDay[];
  destinations: DestinationResponse[];
  isAdding: boolean;
  onAddOption: (suggestion: TransportSuggestion, optionIndex: number, dayId: string, extra?: ExtraPayload) => void;
}

function SuggestionCard({ suggestion, days, destinations, isAdding, onAddOption }: SuggestionCardProps) {
  const sourceCity = suggestion.source_city ?? suggestion.source_item_title ?? "?";
  const destinationCity = suggestion.destination_city ?? suggestion.destination_item_title ?? "?";
  const sourceDayNumber = suggestion.source_day_number;
  const destinationDayNumber = suggestion.destination_day_number;

  const dayRangeLabel = (() => {
    if (sourceDayNumber == null) return null;
    if (destinationDayNumber == null || destinationDayNumber === sourceDayNumber) {
      return `Day ${sourceDayNumber}`;
    }
    return `Day ${sourceDayNumber} → Day ${destinationDayNumber}`;
  })();

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="text-sm">
        <p className="font-medium">
          {sourceCity}
          <span className="text-muted-foreground mx-2">→</span>
          {destinationCity}
        </p>
        {dayRangeLabel && (
          <p className="text-xs text-muted-foreground mt-0.5">{dayRangeLabel}</p>
        )}
        {(suggestion.source_item_title || suggestion.destination_item_title) && (
          <p className="text-xs text-muted-foreground">
            {suggestion.source_item_title ?? suggestion.source_city} →{" "}
            {suggestion.destination_item_title ?? suggestion.destination_city}
          </p>
        )}
      </div>

      <div className="space-y-2">
        {suggestion.options.map((option, optIdx) => (
          <OptionRow
            key={optIdx}
            option={option}
            optIdx={optIdx}
            suggestion={suggestion}
            days={days}
            destinations={destinations}
            disabled={isAdding}
            onAddOption={onAddOption}
          />
        ))}
      </div>
    </div>
  );
}

interface OptionRowProps {
  option: TransportSuggestion["options"][number];
  optIdx: number;
  suggestion: TransportSuggestion;
  days: PlanDay[];
  destinations: DestinationResponse[];
  disabled: boolean;
  onAddOption: (suggestion: TransportSuggestion, optionIndex: number, dayId: string, extra?: ExtraPayload) => void;
}

function OptionRow({ option, optIdx, suggestion, days, destinations, disabled, onAddOption }: OptionRowProps) {
  const defaultDay = days.find((d) => d.day_number === suggestion.source_day_number) ?? days[0];

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 text-sm">
        <span className="font-medium">{option.name}</span>
        {option.one_line && <span className="text-muted-foreground ml-2">{option.one_line}</span>}
        {option.price_hint && <span className="text-xs text-muted-foreground ml-2">{option.price_hint}</span>}
      </div>
      {days.length > 1 ? (
        <DayPickerDropdown
          suggestion={suggestion}
          optIdx={optIdx}
          days={days}
          destinations={destinations}
          defaultDay={defaultDay}
          disabled={disabled}
          onAddOption={onAddOption}
        />
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={disabled || !defaultDay}
          onClick={() => {
            if (defaultDay) {
              onAddOption(suggestion, optIdx, defaultDay.id, computeExtraPayload(defaultDay, suggestion));
            }
          }}
        >
          {disabled ? <Loader2 className="h-3 w-3 animate-spin" /> : "+ Add"}
        </Button>
      )}
    </div>
  );
}

interface DayPickerDropdownProps {
  suggestion: TransportSuggestion;
  optIdx: number;
  days: PlanDay[];
  destinations: DestinationResponse[];
  defaultDay: PlanDay | undefined;
  disabled: boolean;
  onAddOption: (suggestion: TransportSuggestion, optionIndex: number, dayId: string, extra?: ExtraPayload) => void;
}

function DayPickerDropdown({
  suggestion,
  optIdx,
  days,
  destinations,
  defaultDay,
  disabled,
  onAddOption,
}: DayPickerDropdownProps) {
  const [open, setOpen] = useState(false);

  const filteredDays = days.filter((d) => {
    if (suggestion.source_day_number == null || suggestion.destination_day_number == null) return true;
    return d.day_number >= suggestion.source_day_number && d.day_number <= suggestion.destination_day_number;
  });

  function getDayLabel(day: PlanDay): string {
    const city = destinations.find((d) => d.days.includes(day.day_number))?.city;
    return `Day ${day.day_number}${city ? ` – ${city}` : ""}`;
  }

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {disabled ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add to Day ▼"}
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 bg-popover border rounded-lg shadow-md p-2 space-y-1 min-w-[180px]">
          {filteredDays.map((day) => (
            <button
              key={day.id}
              className="w-full text-left px-2 py-1 text-sm hover:bg-muted rounded"
              onClick={() => {
                setOpen(false);
                onAddOption(suggestion, optIdx, day.id, computeExtraPayload(day, suggestion));
              }}
            >
              {getDayLabel(day)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
