"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useYComments } from "@/lib/yjs/hooks";
import { usePlanCollab } from "@/features/plans/hooks/PlanCollabContext";
import CommentsSheet from "@/features/social/components/CommentsSheet";

interface Props {
  planItemId: string;
  itemTitle: string;
}

export default function ItemComments({ planItemId, itemTitle }: Props) {
  const { doc, role } = usePlanCollab();
  const all = useYComments(doc);
  const count = all.filter(
    (comment) => comment.plan_item_id === planItemId && comment.deleted_at === null,
  ).length;

  const [open, setOpen] = useState(false);
  const isOwner = role === "owner";

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={
              count === 0
                ? "Comment on this item"
                : `${count} ${count === 1 ? "comment" : "comments"} on this item`
            }
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors",
              "border-border text-ink-subtle hover:border-primary/30 hover:text-ink",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary",
              count > 0 && "border-primary/40 bg-primary/5 text-primary",
            )}
          >
            <MessageCircle className="size-3.5" strokeWidth={1.5} />
            {count > 0 ? <span className="tabular-nums">{count}</span> : null}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {count === 0
            ? "Comment on this item"
            : `${count} ${count === 1 ? "comment" : "comments"}`}
        </TooltipContent>
      </Tooltip>

      <CommentsSheet
        open={open}
        onOpenChange={setOpen}
        scopedItemId={planItemId}
        scopedItemTitle={itemTitle}
        isPlanOwner={isOwner}
      />
    </>
  );
}
