"use client";

import { RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type AddItemPayload, type AiSuggestion, type PlanDay } from "@/lib/api";
import { useAiSuggestions } from "@/features/plans/hooks/useAiSuggestions";
import SuggestionCard from "@/features/plans/components/SuggestionCard";
import SkeletonCard from "@/features/plans/components/SkeletonCard";

interface Props {
  planId: string;
  userId: string;
  destination: string;
  days: PlanDay[];
  onAddItem: (dayId: string, payload: AddItemPayload) => void;
  initialSuggestions?: AiSuggestion[] | null;
}

export default function SuggestionsStrip({ planId, userId, destination, days, onAddItem, initialSuggestions }: Props) {
  const { suggestions, isLoading, error, refresh, addingNames, addSuggestion } = useAiSuggestions({
    planId,
    userId,
    destination,
    onAddItem,
    initialSuggestions,
  });

  if (!isLoading && suggestions.length === 0 && !error) return null;

  return (
    <div className="space-y-2">
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
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            : suggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.slug}
                  suggestion={suggestion}
                  days={days}
                  isAdding={addingNames.has(suggestion.name)}
                  onAdd={(dayId) => addSuggestion(suggestion, dayId)}
                />
              ))}
        </div>
      )}
    </div>
  );
}
