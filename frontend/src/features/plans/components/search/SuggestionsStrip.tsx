"use client";

import { RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type AddItemPayload, type AiSuggestion, type DestinationResponse, type PlanDay } from "@/lib/api";
import {
  isPlaceholder,
  useAiSuggestions,
} from "@/features/plans/hooks/useAiSuggestions";
import { usePlanCollab } from "@/features/plans/hooks/PlanCollabContext";
import SuggestionCard from "@/features/plans/components/search/SuggestionCard";
import SkeletonCard from "@/features/plans/components/dashboard/SkeletonCard";

interface Props {
  planId: string;
  days: PlanDay[];
  destinations: DestinationResponse[];
  onAddItem: (dayId: string, payload: AddItemPayload) => void;
  initialSuggestions?: AiSuggestion[] | null;
}

export default function SuggestionsStrip({ planId, days, destinations, onAddItem, initialSuggestions }: Props) {
  const { role } = usePlanCollab();
  const { suggestions, isLoading, error, refresh, addingNames, addSuggestion, triggerEnrichment } =
    useAiSuggestions({
      planId,
      onAddItem,
      destinations,
      days,
      initialSuggestions,
    });

  if (role === "viewer") return null;
  if (!isLoading && suggestions.length === 0 && !error) return null;

  return (
    <div
      className="space-y-2"
      onPointerEnter={triggerEnrichment}
      onFocusCapture={triggerEnrichment}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI Suggestions</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 ml-auto"
          onClick={refresh}
          disabled={isLoading}
          title="Refresh suggestions"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-muted-foreground py-1">{error}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
            : suggestions.map((slot) =>
                isPlaceholder(slot) ? (
                  <SkeletonCard key={slot.slug} />
                ) : (
                  <SuggestionCard
                    key={slot.slug}
                    suggestion={slot}
                    days={days}
                    destinations={destinations}
                    isAdding={addingNames.has(slot.name)}
                    onAdd={(dayId) => addSuggestion(slot, dayId)}
                  />
                ),
              )}
        </div>
      )}
    </div>
  );
}
