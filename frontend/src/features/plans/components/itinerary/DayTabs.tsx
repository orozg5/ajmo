"use client";

import { useDroppable } from "@dnd-kit/core";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type PlanDay } from "@/lib/api";

export const DAY_DROPPABLE_PREFIX = "day-drop-";

export function dayDroppableId(dayId: string): string {
  return `${DAY_DROPPABLE_PREFIX}${dayId}`;
}

interface DayChipProps {
  day: PlanDay;
  isActive: boolean;
  canRemove: boolean;
  isLoading: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

function DayChip({ day, isActive, canRemove, isLoading, onSelect, onRemove }: DayChipProps) {
  const { isOver, setNodeRef } = useDroppable({ id: dayDroppableId(day.id) });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative flex shrink-0 items-center rounded-full border transition-colors",
        isActive
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/40 hover:bg-muted/60",
        isOver && "border-primary/70 ring-2 ring-primary/40",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive ? "true" : undefined}
        className={cn(
          "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
          canRemove && "pr-2",
        )}
      >
        <span className="text-sm font-semibold text-ink">Day {day.day_number}</span>
        {day.date && <span className="text-xs text-ink-subtle">{day.date}</span>}
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            isActive ? "bg-primary/20 text-primary" : "bg-muted text-ink-subtle",
          )}
        >
          {day.items.length}
        </span>
      </button>
      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={isLoading}
          aria-label={`Remove day ${day.day_number}`}
          className="mr-1 h-6 w-6 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
        >
          <Trash2 className="size-3.5" strokeWidth={1.5} />
        </Button>
      )}
    </div>
  );
}

interface Props {
  days: PlanDay[];
  activeDayId: string;
  isLoading: boolean;
  onSelectDay: (dayId: string) => void;
  onRemoveDay: (dayId: string) => void;
}

export default function DayTabs({
  days,
  activeDayId,
  isLoading,
  onSelectDay,
  onRemoveDay,
}: Props) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = days.findIndex((day) => day.id === activeDayId);
    if (index === -1) return;
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = days[index + delta];
    if (next) onSelectDay(next.id);
  }

  return (
    <div
      role="tablist"
      aria-label="Trip days"
      onKeyDown={handleKeyDown}
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/60 p-2"
    >
      {days.map((day) => (
        <DayChip
          key={day.id}
          day={day}
          isActive={day.id === activeDayId}
          canRemove={days.length > 1}
          isLoading={isLoading}
          onSelect={() => onSelectDay(day.id)}
          onRemove={() => onRemoveDay(day.id)}
        />
      ))}
    </div>
  );
}
