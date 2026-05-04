"use client";

import { Loader2, Plus, Train } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type TransportSuggestion } from "@/lib/api";

interface InlineTransportBarProps {
  suggestion: TransportSuggestion | undefined;
  isFetching: boolean;
  isAdding: boolean;
  onAdd: (optionIndex: number) => void;
}

export default function InlineTransportBar({
  suggestion,
  isFetching,
  isAdding,
  onAdd,
}: InlineTransportBarProps) {
  if (isFetching && !suggestion) {
    return (
      <div className="flex items-center justify-center gap-2 py-2 text-xs text-ink-subtle">
        <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
        Looking up transport…
      </div>
    );
  }

  if (!suggestion || suggestion.options.length === 0) {
    return null;
  }

  return (
    <div className="my-1.5 flex flex-wrap items-center gap-2 rounded-full border border-dashed border-secondary/40 bg-secondary/5 px-3 py-1.5">
      <Train className="size-4 text-secondary" strokeWidth={1.5} />
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {suggestion.options.map((option, index) => (
          <div key={index} className="flex items-center gap-1">
            <span className="text-xs text-ink-subtle">
              <span className="font-medium text-ink">{option.name}</span>
              {option.one_line ? (
                <span className="ml-1 opacity-75">{option.one_line}</span>
              ) : null}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 rounded-full text-secondary hover:bg-secondary/15"
              disabled={isAdding}
              onClick={() => onAdd(index)}
              aria-label={`Add ${option.name}`}
            >
              {isAdding ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <Plus className="size-4" strokeWidth={1.5} />
              )}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
