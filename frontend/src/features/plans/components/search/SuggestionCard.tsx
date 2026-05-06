"use client";

import { useMemo, useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type AiSuggestion, type DestinationResponse, type PlanDay } from "@/lib/api";
import { ITEM_TYPE_STYLE, type ItemType } from "@/features/plans/utils/itemType";

interface Props {
  suggestion: AiSuggestion;
  days: PlanDay[];
  destinations: DestinationResponse[];
  isAdding: boolean;
  onAdd: (dayId: string) => void;
}

function eligibleDaysForSuggestion(
  suggestion: AiSuggestion,
  days: PlanDay[],
  destinations: DestinationResponse[],
): PlanDay[] {
  const city = suggestion.destination_city?.trim().toLowerCase();
  if (!city) return [];
  const match = destinations.find((d) => d.city.trim().toLowerCase() === city);
  if (!match) return [];
  const allowed = new Set(match.days);
  return days.filter((day) => allowed.has(day.day_number));
}

export default function SuggestionCard({ suggestion, days, destinations, isAdding, onAdd }: Props) {
  const [picking, setPicking] = useState(false);

  const eligibleDays = useMemo(
    () => eligibleDaysForSuggestion(suggestion, days, destinations),
    [suggestion, days, destinations],
  );
  const hasNoEligibleDays = eligibleDays.length === 0;

  const typeStyle = ITEM_TYPE_STYLE[suggestion.item_type as ItemType] ?? ITEM_TYPE_STYLE.note;
  const TypeIcon = typeStyle.Icon;

  if (picking) {
    return (
      <div className={cn("rounded-lg border p-3 flex flex-col gap-2", typeStyle.tint)}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium">Add to:</p>
          <button onClick={() => setPicking(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {eligibleDays.map((day) => (
            <Button
              key={day.id}
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              disabled={isAdding}
              onClick={() => {
                setPicking(false);
                onAdd(day.id);
              }}
            >
              {isAdding ? <Loader2 className="h-3 w-3 animate-spin" /> : `Day ${day.day_number}`}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  const addButton = (
    <Button
      size="sm"
      variant="outline"
      className="h-7 px-2.5 text-xs"
      onClick={() =>
        eligibleDays.length === 1 ? onAdd(eligibleDays[0].id) : setPicking(true)
      }
      disabled={isAdding || hasNoEligibleDays}
    >
      {isAdding ? <Loader2 className="h-3 w-3 animate-spin" /> : "+ Add"}
    </Button>
  );

  return (
    <div className={cn("rounded-lg border p-3 flex flex-col gap-2", typeStyle.tint)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight line-clamp-2">{suggestion.name}</p>
        <Badge
          variant="outline"
          className={cn("shrink-0 gap-1 text-[10px] font-medium uppercase tracking-wide", typeStyle.badge)}
        >
          <TypeIcon className="size-3" strokeWidth={1.75} />
          {typeStyle.label}
        </Badge>
      </div>
      {suggestion.destination_city && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3" strokeWidth={1.5} />
          {suggestion.destination_city}
        </span>
      )}
      {suggestion.one_line && (
        <p className="text-xs text-muted-foreground line-clamp-2">{suggestion.one_line}</p>
      )}
      <div className="flex items-center justify-between gap-2 mt-auto pt-1">
        <span className="text-xs text-muted-foreground">{suggestion.price_hint ?? ""}</span>
        {hasNoEligibleDays ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{addButton}</span>
            </TooltipTrigger>
            <TooltipContent>
              {suggestion.destination_city
                ? `Assign a day to ${suggestion.destination_city} first.`
                : "This suggestion has no destination."}
            </TooltipContent>
          </Tooltip>
        ) : (
          addButton
        )}
      </div>
    </div>
  );
}
