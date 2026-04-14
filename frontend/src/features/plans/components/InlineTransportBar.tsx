"use client";

import { Loader2 } from "lucide-react";

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
      <div className="flex justify-center py-2">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!suggestion || suggestion.options.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 py-1.5 px-1 flex-wrap">
      <div className="flex-1 h-px bg-border min-w-4" />
      <div className="flex items-center gap-3 flex-wrap">
        {suggestion.options.map((option, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {option.name}
              {option.one_line && (
                <span className="ml-1 opacity-70">{option.one_line}</span>
              )}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 px-1.5 text-xs"
              disabled={isAdding}
              onClick={() => onAdd(i)}
            >
              {isAdding ? <Loader2 className="h-3 w-3 animate-spin" /> : "+ Add"}
            </Button>
          </div>
        ))}
      </div>
      <div className="flex-1 h-px bg-border min-w-4" />
    </div>
  );
}
