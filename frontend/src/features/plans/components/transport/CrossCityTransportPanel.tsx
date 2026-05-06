"use client";

import { useMemo, useState } from "react";

import { Bus, Car, Loader2, Plane, Sailboat, Train, TrainFront } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  type CrossCityTransportMode,
  type DestinationResponse,
  type PlanDay,
  type TransportOption,
  type TransportSuggestion,
} from "@/lib/api";
import {
  formatTransitionLabel,
  getSlotOptions,
  type CrossCityExtraPayload,
  type CrossCitySlotOption,
} from "@/features/plans/utils/crossCityPayload";
import {
  formatDistance,
  formatDuration,
} from "@/features/plans/utils/transportFormat";

type ExtraPayload = CrossCityExtraPayload;

const MODE_ICON: Record<CrossCityTransportMode, typeof TrainFront> = {
  drive: Car,
  train: Train,
  bus: Bus,
  ferry: Sailboat,
  flight: Plane,
};

interface CrossCityTransportPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: TransportSuggestion[];
  isLoading: boolean;
  error: string | null;
  days: PlanDay[];
  destinations: DestinationResponse[];
  addingKeys: Set<string>;
  onAddOption: (
    suggestion: TransportSuggestion,
    optionIndex: number,
    dayId: string,
    extra?: ExtraPayload,
  ) => void;
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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrainFront className="h-4 w-4" />
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
  onAddOption: (
    suggestion: TransportSuggestion,
    optionIndex: number,
    dayId: string,
    extra?: ExtraPayload,
  ) => void;
}

function SuggestionCard({ suggestion, days, destinations, isAdding, onAddOption }: SuggestionCardProps) {
  const sourceCity = suggestion.source_city ?? suggestion.source_item_title ?? "?";
  const destinationCity = suggestion.destination_city ?? suggestion.destination_item_title ?? "?";

  // Subtitle shows ONLY the day on which the actual transition happens, not
  // either city's full coverage span. For Paris (Days 1-3) → Le Mans (Day 3)
  // the transition window is Day 3, so the subtitle reads "Day 3".
  const transitionLabel = formatTransitionLabel(suggestion, destinations);

  const slotOptions = useMemo(
    () => getSlotOptions(suggestion, days, destinations),
    [suggestion, days, destinations],
  );

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="text-sm">
        <p className="font-medium">
          {sourceCity}
          <span className="text-muted-foreground mx-2">→</span>
          {destinationCity}
        </p>
        {transitionLabel && (
          <p className="text-xs text-muted-foreground mt-0.5">{transitionLabel}</p>
        )}
      </div>

      <div className="space-y-2">
        {suggestion.options.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No routes found between these cities.</p>
        ) : (
          suggestion.options.map((option, optIdx) => (
            <OptionRow
              key={`${option.mode}-${optIdx}`}
              option={option}
              optIdx={optIdx}
              suggestion={suggestion}
              slotOptions={slotOptions}
              disabled={isAdding}
              onAddOption={onAddOption}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface OptionRowProps {
  option: TransportOption;
  optIdx: number;
  suggestion: TransportSuggestion;
  slotOptions: CrossCitySlotOption[];
  disabled: boolean;
  onAddOption: (
    suggestion: TransportSuggestion,
    optionIndex: number,
    dayId: string,
    extra?: ExtraPayload,
  ) => void;
}

function OptionRow({
  option,
  optIdx,
  suggestion,
  slotOptions,
  disabled,
  onAddOption,
}: OptionRowProps) {
  const Icon = MODE_ICON[option.mode] ?? TrainFront;
  const detailParts: string[] = [];
  if (option.duration_seconds != null) detailParts.push(formatDuration(option.duration_seconds));
  if (option.distance_meters != null) detailParts.push(formatDistance(option.distance_meters));
  if (option.transit_summary) detailParts.push(option.transit_summary);

  return (
    <div className="flex items-center gap-2">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary/15 text-secondary">
        <Icon className="size-3.5" strokeWidth={1.75} />
      </div>
      <div className="flex-1 text-sm">
        <span className="font-medium">{option.name}</span>
        {detailParts.length > 0 && (
          <span className="ml-2 text-muted-foreground">{detailParts.join(" · ")}</span>
        )}
      </div>
      {slotOptions.length === 1 ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={disabled}
          onClick={() =>
            onAddOption(suggestion, optIdx, slotOptions[0].dayId, slotOptions[0].payload)
          }
          title={slotOptions[0].label}
        >
          {disabled ? <Loader2 className="h-3 w-3 animate-spin" /> : "+ Add"}
        </Button>
      ) : (
        <SlotPickerDropdown
          slotOptions={slotOptions}
          disabled={disabled}
          onPick={(slot) => onAddOption(suggestion, optIdx, slot.dayId, slot.payload)}
        />
      )}
    </div>
  );
}

interface SlotPickerDropdownProps {
  slotOptions: CrossCitySlotOption[];
  disabled: boolean;
  onPick: (slot: CrossCitySlotOption) => void;
}

function SlotPickerDropdown({ slotOptions, disabled, onPick }: SlotPickerDropdownProps) {
  const [open, setOpen] = useState(false);

  if (slotOptions.length === 0) {
    return (
      <Button size="sm" variant="outline" className="h-7 text-xs" disabled>
        No slot
      </Button>
    );
  }

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {disabled ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add ▼"}
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 bg-popover border rounded-lg shadow-md p-2 space-y-1 min-w-[260px]">
          {slotOptions.map((slot) => (
            <button
              key={slot.key}
              className="w-full text-left px-2 py-1 text-sm hover:bg-muted rounded"
              onClick={() => {
                setOpen(false);
                onPick(slot);
              }}
            >
              {slot.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
