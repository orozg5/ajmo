"use client";

import { ChevronDown, MapPin, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type PlanVisibility } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  PLAN_PAGE_SIZE_LABEL,
  PLAN_PAGE_SIZE_OPTIONS,
  PLAN_SORT_LABEL,
  type PlanPageSize,
  type PlanSortMode,
  type PlanFilterState,
} from "@/features/plans/hooks/usePlanFilters";
import {
  TRIP_STATUS_ICON,
  TRIP_STATUS_LABEL,
  TRIP_STATUS_ORDER,
  type TripStatus,
} from "@/features/plans/utils/tripStatus";
import { VISIBILITY_ICON, VISIBILITY_LABEL } from "@/features/plans/utils/visibility";

const VISIBILITY_OPTIONS: PlanVisibility[] = ["private", "link", "friends", "public"];

const SORT_OPTIONS: PlanSortMode[] = ["recent", "soonest", "latest", "alphabetical"];

type TripFilterBarProps = {
  state: PlanFilterState;
  availableDestinations: string[];
  resultCount: number;
  visibleCount: number;
  isFiltering: boolean;
  hideVisibilityFilter?: boolean;
  onSearchChange: (value: string) => void;
  onStatusToggle: (status: TripStatus) => void;
  onDestinationToggle: (city: string) => void;
  onVisibilityToggle: (visibility: PlanVisibility) => void;
  onSortChange: (sort: PlanSortMode) => void;
  onPageSizeChange: (pageSize: PlanPageSize) => void;
  onClearFilters: () => void;
};

function pageSizeKey(value: PlanPageSize): string {
  return typeof value === "number" ? String(value) : value;
}

export default function TripFilterBar({
  state,
  availableDestinations,
  resultCount,
  visibleCount,
  isFiltering,
  hideVisibilityFilter = false,
  onSearchChange,
  onStatusToggle,
  onDestinationToggle,
  onVisibilityToggle,
  onSortChange,
  onPageSizeChange,
  onClearFilters,
}: TripFilterBarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
            strokeWidth={1.5}
          />
          <Input
            value={state.search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by title…"
            className="h-9 pl-8 pr-8"
            aria-label="Search trips"
          />
          {state.search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-subtle hover:bg-muted hover:text-ink"
            >
              <X className="size-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
        <Select value={state.sort} onValueChange={(value) => onSortChange(value as PlanSortMode)}>
          <SelectTrigger className="h-9! w-full sm:w-[210px]" aria-label="Sort trips">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {PLAN_SORT_LABEL[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {TRIP_STATUS_ORDER.map((status) => {
            const StatusIcon = TRIP_STATUS_ICON[status];
            const active = state.statuses.includes(status);
            return (
              <button
                key={status}
                type="button"
                aria-pressed={active}
                onClick={() => onStatusToggle(status)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-ink"
                    : "border-border bg-card text-ink-subtle hover:bg-muted",
                )}
              >
                <StatusIcon className="size-3.5" strokeWidth={1.75} />
                {TRIP_STATUS_LABEL[status]}
              </button>
            );
          })}
        </div>

        <DestinationPopover
          destinations={availableDestinations}
          selected={state.destinations}
          onToggle={onDestinationToggle}
        />

        {hideVisibilityFilter ? null : (
          <VisibilityPopover selected={state.visibilities} onToggle={onVisibilityToggle} />
        )}

        <Button
          variant="destructive"
          size="sm"
          onClick={onClearFilters}
          disabled={!isFiltering}
          aria-label="Clear all filters"
          className="ml-auto"
        >
          <X className="size-3.5" strokeWidth={2} />
          Clear filters
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
        <span className="text-xs text-ink-subtle" aria-live="polite">
          {resultCount === 0
            ? "No trips"
            : visibleCount < resultCount
              ? `Showing ${visibleCount} of ${resultCount} trips`
              : `Showing ${resultCount} ${resultCount === 1 ? "trip" : "trips"}`}
        </span>
        <div className="flex items-center gap-2 text-xs text-ink-subtle">
          <span>Show</span>
          <Select
            value={pageSizeKey(state.pageSize)}
            onValueChange={(value) =>
              onPageSizeChange(value === "all" ? "all" : (Number(value) as PlanPageSize))
            }
          >
            <SelectTrigger size="sm" className="h-7! w-[120px]" aria-label="Trips per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_PAGE_SIZE_OPTIONS.map((option) => {
                const key = pageSizeKey(option);
                return (
                  <SelectItem key={key} value={key}>
                    {PLAN_PAGE_SIZE_LABEL[key]}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

type DestinationPopoverProps = {
  destinations: string[];
  selected: string[];
  onToggle: (city: string) => void;
};

function DestinationPopover({ destinations, selected, onToggle }: DestinationPopoverProps) {
  const disabled = destinations.length === 0;
  const label =
    selected.length === 0
      ? "Destinations"
      : selected.length === 1
        ? selected[0]
        : `Destinations (${selected.length})`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="gap-1.5">
          <MapPin className="size-3.5" strokeWidth={1.5} />
          {label}
          <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.5} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search destinations…" />
          <CommandList>
            <CommandEmpty>No destinations.</CommandEmpty>
            <CommandGroup>
              {destinations.map((city) => {
                const checked = selected.includes(city);
                return (
                  <CommandItem
                    key={city}
                    value={city}
                    onSelect={() => onToggle(city)}
                    data-checked={checked}
                  >
                    {city}
                    {checked ? (
                      <Badge variant="secondary" className="ml-auto">
                        Selected
                      </Badge>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type VisibilityPopoverProps = {
  selected: PlanVisibility[];
  onToggle: (visibility: PlanVisibility) => void;
};

function VisibilityPopover({ selected, onToggle }: VisibilityPopoverProps) {
  const label =
    selected.length === 0
      ? "Visibility"
      : selected.length === 1
        ? VISIBILITY_LABEL[selected[0]]
        : `Visibility (${selected.length})`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          {label}
          <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.5} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <ul className="flex flex-col gap-0.5">
          {VISIBILITY_OPTIONS.map((option) => {
            const Icon = VISIBILITY_ICON[option];
            const checked = selected.includes(option);
            const id = `visibility-${option}`;
            return (
              <li key={option}>
                <label
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox id={id} checked={checked} onCheckedChange={() => onToggle(option)} />
                  <Icon className="size-3.5 text-ink-subtle" strokeWidth={1.5} />
                  {VISIBILITY_LABEL[option]}
                </label>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
