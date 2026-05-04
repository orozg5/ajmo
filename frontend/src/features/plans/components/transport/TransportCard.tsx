"use client";

import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { AlertTriangle, GripVertical, TrainFront, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type PlanItem } from "@/lib/api";

interface Props {
  item: PlanItem;
  onRemove: () => void;
  isHighlighted?: boolean;
  isOrphan?: boolean;
  onHoverChange?: (itemId: string, hovered: boolean) => void;
}

export default function TransportCard({ item, onRemove, isHighlighted = false, isOrphan = false, onHoverChange }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const ai = (item.ai_data ?? null) as { one_line?: string; price_hint?: string } | null;
  const oneLine = ai?.one_line ?? null;
  const priceHint = ai?.price_hint ?? null;
  const subtitle = item.notes?.trim() || oneLine;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  } as const;

  return (
    <article
      ref={setNodeRef}
      style={style}
      data-item-id={item.id}
      onMouseEnter={() => onHoverChange?.(item.id, true)}
      onMouseLeave={() => onHoverChange?.(item.id, false)}
      onFocus={() => onHoverChange?.(item.id, true)}
      onBlur={() => onHoverChange?.(item.id, false)}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-card p-3 pl-4",
        "shadow-[0_1px_0_rgba(10,10,12,0.04),0_4px_12px_-8px_rgba(10,10,12,0.06)]",
        isDragging && "ring-2 ring-primary/60",
        isHighlighted && "ring-2 ring-secondary/70",
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-sky-500/70" />
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Drag ${item.title}`}
          className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-ink-subtle hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" strokeWidth={1.5} />
        </button>

        <Badge
          variant="outline"
          className="shrink-0 gap-1 border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
        >
          <TrainFront className="size-3.5" strokeWidth={1.5} />
          Transport
        </Badge>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-ink">{item.title}</span>
            {isOrphan ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    role="img"
                    aria-label="Transport may be stale"
                    className="inline-flex size-5 shrink-0 items-center justify-center text-amber-600 dark:text-amber-400"
                  >
                    <AlertTriangle className="size-4" strokeWidth={1.5} />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  This transport no longer connects adjacent items — consider removing.
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          {subtitle ? (
            <span className="truncate text-xs text-ink-subtle">{subtitle}</span>
          ) : null}
          {priceHint && !subtitle?.includes(priceHint) ? (
            <span className="truncate text-xs text-ink-subtle">{priceHint}</span>
          ) : null}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Remove ${item.title}`}
        >
          <Trash2 className="size-4" strokeWidth={1.5} />
        </Button>
      </div>
    </article>
  );
}
