"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";

import { type Plan, type PlanVisibility } from "@/lib/api";
import { getTripStatus, type TripStatus } from "@/features/plans/utils/tripStatus";

export type PlanSortMode = "recent" | "soonest" | "latest" | "alphabetical";

// Intentionally configurable. Update this map to change sort labels in TripFilterBar.
export const PLAN_SORT_LABEL: Record<PlanSortMode, string> = {
  recent: "Recently created",
  soonest: "Soonest first",
  latest: "Latest first",
  alphabetical: "Alphabetical",
};

export type PlanPageSize = 5 | 10 | 20 | "all";

// Intentionally configurable — page size dropdown options for TripFilterBar.
export const PLAN_PAGE_SIZE_OPTIONS: PlanPageSize[] = [5, 10, 20, "all"];

export const PLAN_PAGE_SIZE_LABEL: Record<string, string> = {
  "5": "5 per page",
  "10": "10 per page",
  "20": "20 per page",
  all: "All",
};

const DEFAULT_PAGE_SIZE: PlanPageSize = 5;

export type PlanFilterState = {
  search: string;
  statuses: TripStatus[];
  destinations: string[];
  visibilities: PlanVisibility[];
  sort: PlanSortMode;
  pageSize: PlanPageSize;
};

const DEFAULT_FILTER_STATE: PlanFilterState = {
  search: "",
  statuses: [],
  destinations: [],
  visibilities: [],
  sort: "recent",
  pageSize: DEFAULT_PAGE_SIZE,
};

export type UsePlanFiltersOptions = {
  plans: Plan[];
  hideVisibilityFilter?: boolean;
};

export type UsePlanFiltersReturn = {
  state: PlanFilterState;
  filteredPlans: Plan[];
  visiblePlans: Plan[];
  availableDestinations: string[];
  resultCount: number;
  visibleCount: number;
  isFiltering: boolean;
  handleSearchChange: (value: string) => void;
  handleStatusToggle: (status: TripStatus) => void;
  handleDestinationToggle: (city: string) => void;
  handleVisibilityToggle: (visibility: PlanVisibility) => void;
  handleSortChange: (sort: PlanSortMode) => void;
  handlePageSizeChange: (pageSize: PlanPageSize) => void;
  clearFilters: () => void;
};

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

function compareSoonest(a: Plan, b: Plan): number {
  const aKey = a.date_from ?? a.date_to ?? "";
  const bKey = b.date_from ?? b.date_to ?? "";
  if (!aKey && !bKey) return 0;
  if (!aKey) return 1;
  if (!bKey) return -1;
  return aKey.localeCompare(bKey);
}

export function usePlanFilters({ plans, hideVisibilityFilter = false }: UsePlanFiltersOptions): UsePlanFiltersReturn {
  const [state, setState] = useState<PlanFilterState>(DEFAULT_FILTER_STATE);
  const deferredSearch = useDeferredValue(state.search);

  const handleSearchChange = useCallback((value: string) => {
    setState((current) => ({ ...current, search: value }));
  }, []);

  const handleStatusToggle = useCallback((status: TripStatus) => {
    setState((current) => ({ ...current, statuses: toggle(current.statuses, status) }));
  }, []);

  const handleDestinationToggle = useCallback((city: string) => {
    setState((current) => ({ ...current, destinations: toggle(current.destinations, city) }));
  }, []);

  const handleVisibilityToggle = useCallback((visibility: PlanVisibility) => {
    setState((current) => ({ ...current, visibilities: toggle(current.visibilities, visibility) }));
  }, []);

  const handleSortChange = useCallback((sort: PlanSortMode) => {
    setState((current) => ({ ...current, sort }));
  }, []);

  const handlePageSizeChange = useCallback((pageSize: PlanPageSize) => {
    setState((current) => ({ ...current, pageSize }));
  }, []);

  const clearFilters = useCallback(() => {
    setState(DEFAULT_FILTER_STATE);
  }, []);

  const availableDestinations = useMemo(() => {
    const cities = new Set<string>();
    for (const plan of plans) {
      for (const destination of plan.destinations ?? []) {
        if (destination.city) cities.add(destination.city);
      }
    }
    return Array.from(cities).sort((a, b) => a.localeCompare(b));
  }, [plans]);

  const filteredPlans = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const today = new Date();

    const filtered = plans.filter((plan) => {
      if (query && !plan.title.toLowerCase().includes(query)) return false;

      if (state.statuses.length > 0) {
        const status = getTripStatus(plan, today);
        if (!state.statuses.includes(status)) return false;
      }

      if (state.destinations.length > 0) {
        const cities = new Set((plan.destinations ?? []).map((destination) => destination.city));
        const hasMatch = state.destinations.some((city) => cities.has(city));
        if (!hasMatch) return false;
      }

      if (!hideVisibilityFilter && state.visibilities.length > 0) {
        if (!state.visibilities.includes(plan.visibility)) return false;
      }

      return true;
    });

    const sorted = [...filtered];
    switch (state.sort) {
      case "soonest":
        sorted.sort(compareSoonest);
        break;
      case "latest":
        sorted.sort((a, b) => -compareSoonest(a, b));
        break;
      case "alphabetical":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "recent":
      default:
        sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
        break;
    }

    return sorted;
  }, [plans, state.statuses, state.destinations, state.visibilities, state.sort, deferredSearch, hideVisibilityFilter]);

  const visiblePlans = useMemo(() => {
    if (state.pageSize === "all") return filteredPlans;
    return filteredPlans.slice(0, state.pageSize);
  }, [filteredPlans, state.pageSize]);

  const isFiltering =
    state.search.trim().length > 0 ||
    state.statuses.length > 0 ||
    state.destinations.length > 0 ||
    (!hideVisibilityFilter && state.visibilities.length > 0) ||
    state.sort !== DEFAULT_FILTER_STATE.sort;

  return {
    state,
    filteredPlans,
    visiblePlans,
    availableDestinations,
    resultCount: filteredPlans.length,
    visibleCount: visiblePlans.length,
    isFiltering,
    handleSearchChange,
    handleStatusToggle,
    handleDestinationToggle,
    handleVisibilityToggle,
    handleSortChange,
    handlePageSizeChange,
    clearFilters,
  };
}
