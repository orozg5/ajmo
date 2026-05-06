"use client";

import { useState } from "react";
import { Star } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useYAllRatings } from "@/lib/yjs/hooks";
import { clearRating, setRating } from "@/lib/yjs/mutations";
import { usePlanCollab } from "@/features/plans/hooks/PlanCollabContext";

interface Props {
  planItemId: string;
}

const STARS = [1, 2, 3, 4, 5] as const;

export default function ItemRating({ planItemId }: Props) {
  const { doc, currentUserId, role } = usePlanCollab();
  const ratings = useYAllRatings(doc, currentUserId);
  const summary = ratings.get(planItemId);
  const avg = summary?.avg ?? 0;
  const count = summary?.count ?? 0;
  const mine = summary?.mine ?? null;
  const disabled = !doc || !currentUserId || role === "viewer";

  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? mine ?? 0;
  const tooltipLabel =
    mine != null
      ? `Your rating: ${mine}★`
      : count > 0
        ? `${avg.toFixed(1)}★ avg · ${count} ${count === 1 ? "rating" : "ratings"}`
        : "No ratings yet";

  function handleClick(value: number) {
    if (disabled || !doc || !currentUserId) return;
    if (mine === value) {
      clearRating(doc, planItemId, currentUserId);
    } else {
      setRating(doc, planItemId, currentUserId, value);
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="inline-flex items-center gap-1"
          onMouseLeave={() => setHovered(null)}
        >
          <div className="inline-flex items-center">
            {STARS.map((value) => {
              const filled = value <= display;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleClick(value)}
                  onMouseEnter={() => setHovered(value)}
                  onFocus={() => setHovered(value)}
                  onBlur={() => setHovered(null)}
                  disabled={disabled}
                  aria-label={`Rate ${value} ${value === 1 ? "star" : "stars"}`}
                  aria-pressed={mine === value}
                  className={cn(
                    "inline-flex size-5 items-center justify-center rounded transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    filled ? "text-amber-500" : "text-ink-subtle/50 hover:text-amber-400",
                  )}
                >
                  <Star
                    className="size-4"
                    strokeWidth={1.5}
                    fill={filled ? "currentColor" : "none"}
                  />
                </button>
              );
            })}
          </div>
          {count > 0 ? (
            <span className="text-[11px] text-ink-subtle tabular-nums">
              {avg.toFixed(1)}
              <span className="ml-0.5 opacity-70">({count})</span>
            </span>
          ) : null}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
}
