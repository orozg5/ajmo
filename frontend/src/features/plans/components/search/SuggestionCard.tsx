"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type AiSuggestion, type PlanDay } from "@/lib/api";
import { ITEM_TYPE_EMOJI, type ItemType } from "@/features/plans/utils/itemType";

interface Props {
  suggestion: AiSuggestion;
  days: PlanDay[];
  isAdding: boolean;
  onAdd: (dayId: string) => void;
}

export default function SuggestionCard({ suggestion, days, isAdding, onAdd }: Props) {
  const [picking, setPicking] = useState(false);

  if (picking) {
    return (
      <div className="shrink-0 w-44 rounded-lg border bg-card p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium">Add to:</p>
          <button onClick={() => setPicking(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {days.map((day) => (
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

  return (
    <div className="shrink-0 w-44 rounded-lg border bg-card p-3 flex flex-col gap-1.5">
      <div className="flex items-start gap-1.5">
        <span className="text-base leading-none mt-0.5">{ITEM_TYPE_EMOJI[suggestion.item_type as ItemType] ?? "📍"}</span>
        <p className="text-sm font-medium leading-tight line-clamp-2">{suggestion.name}</p>
      </div>
      {suggestion.destination_city && (
        <span className="text-xs text-muted-foreground font-medium">{suggestion.destination_city}</span>
      )}
      {suggestion.one_line && <p className="text-xs text-muted-foreground line-clamp-2">{suggestion.one_line}</p>}
      <div className="flex items-center justify-between mt-auto pt-1">
        {suggestion.price_hint && <span className="text-xs text-muted-foreground">{suggestion.price_hint}</span>}
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs ml-auto"
          onClick={() => (days.length === 1 ? onAdd(days[0].id) : setPicking(true))}
          disabled={isAdding}
        >
          {isAdding ? <Loader2 className="h-3 w-3 animate-spin" /> : "+ Add"}
        </Button>
      </div>
    </div>
  );
}
