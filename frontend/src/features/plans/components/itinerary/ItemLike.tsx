"use client";

import { ThumbsUp } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useYAllLikes } from "@/lib/yjs/hooks";
import { toggleLike } from "@/lib/yjs/mutations";
import { usePlanCollab } from "@/features/plans/hooks/PlanCollabContext";

interface Props {
  planItemId: string;
}

export default function ItemLike({ planItemId }: Props) {
  const { doc, currentUserId, role } = usePlanCollab();
  const likes = useYAllLikes(doc, currentUserId);
  const summary = likes.get(planItemId);
  const count = summary?.count ?? 0;
  const mine = summary?.mine ?? false;
  const disabled = !doc || !currentUserId || role === "viewer";

  function handleClick() {
    if (disabled || !doc || !currentUserId) return;
    toggleLike(doc, planItemId, currentUserId);
  }

  const label =
    count === 0
      ? "Like this"
      : `${count} ${count === 1 ? "like" : "likes"}${mine ? " · including you" : ""}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          aria-pressed={mine}
          aria-label={label}
          disabled={disabled}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            mine
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-ink-subtle hover:border-primary/30 hover:text-ink",
          )}
        >
          <ThumbsUp
            className="size-3.5"
            strokeWidth={mine ? 2 : 1.5}
            fill={mine ? "currentColor" : "none"}
          />
          {count > 0 ? <span className="tabular-nums">{count}</span> : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
