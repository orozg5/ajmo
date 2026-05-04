"use client";

import { useDroppable } from "@dnd-kit/core";
import { CalendarDays, Plus, Trash2 } from "lucide-react";

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
    <li
      ref={setNodeRef}
      className={cn(
        "group relative rounded-xl border transition-colors",
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
          "w-full rounded-xl px-3 py-2.5 pr-10 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
        )}
      >
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-ink">Day {day.day_number}</span>
          {day.date && <span className="text-xs text-ink-subtle">{day.date}</span>}
        </div>
        {day.title && <p className="mt-0.5 truncate text-xs text-ink-subtle">{day.title}</p>}
        <p className="mt-1 text-[11px] text-ink-subtle">
          {day.items.length} {day.items.length === 1 ? "item" : "items"}
        </p>
      </button>
      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={isLoading}
          aria-label={`Remove day ${day.day_number}`}
          className="absolute right-1.5 top-1.5 h-7 w-7 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
        >
          <Trash2 className="size-4" strokeWidth={1.5} />
        </Button>
      )}
    </li>
  );
}

interface Props {
  days: PlanDay[];
  activeDayId: string;
  isLoading: boolean;
  onSelectDay: (dayId: string) => void;
  onAddDay: () => void;
  onRemoveDay: (dayId: string) => void;
}

export default function DaySidebar({
  days,
  activeDayId,
  isLoading,
  onSelectDay,
  onAddDay,
  onRemoveDay,
}: Props) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const index = days.findIndex((day) => day.id === activeDayId);
    if (index === -1) return;
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next = days[index + delta];
    if (next) onSelectDay(next.id);
  }

  return (
    <aside className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card/60 p-3">
      <div className="flex items-center justify-between px-1 pt-1">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <CalendarDays className="size-4 text-ink-subtle" strokeWidth={1.5} />
          Days
        </div>
        <Button size="sm" variant="ghost" onClick={onAddDay} disabled={isLoading} className="h-7 gap-1 px-2 text-xs">
          <Plus className="size-3.5" strokeWidth={1.5} />
          Add
        </Button>
      </div>

      <ul className="flex flex-col gap-2" onKeyDown={handleKeyDown}>
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
      </ul>
    </aside>
  );
}
