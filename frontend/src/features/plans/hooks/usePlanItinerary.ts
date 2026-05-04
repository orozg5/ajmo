"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addDay as apiAddDay,
  addItem as apiAddItem,
  getDays as apiGetDays,
  removeDay as apiRemoveDay,
  removeItem as apiRemoveItem,
  reorderItems as apiReorderItems,
  updateDay as apiUpdateDay,
  updateItemNotes as apiUpdateItemNotes,
  type AddItemPayload,
  type PlanDay,
  type PlanItem,
  type ReorderEntry,
} from "@/lib/api";
import { sortItems } from "@/features/plans/utils/sortKeys";

export interface UsePlanItineraryOptions {
  planId: string;
  initialDays: PlanDay[];
}

export interface UsePlanItineraryReturn {
  days: PlanDay[];
  addDay: () => Promise<PlanDay>;
  removeDay: (dayId: string) => void;
  addItem: (dayId: string, payload: AddItemPayload) => Promise<PlanItem>;
  removeItem: (dayId: string, itemId: string) => void;
  updateItemNotes: (dayId: string, itemId: string, notes: string | null) => void;
  reorderItems: (entries: ReorderEntry[]) => Promise<PlanItem[]>;
  updateDayNotes: (dayId: string, notes: string | null) => Promise<PlanDay>;
  isLoading: boolean;
}

type DaysCache = PlanDay[];

function planDaysKey(planId: string): readonly ["plan-itinerary", string] {
  return ["plan-itinerary", planId] as const;
}

function patchDays(cache: DaysCache | undefined, updater: (days: DaysCache) => DaysCache): DaysCache {
  return updater(cache ? [...cache] : []);
}

export function usePlanItinerary({ planId, initialDays }: UsePlanItineraryOptions): UsePlanItineraryReturn {
  const queryClient = useQueryClient();
  const queryKey = planDaysKey(planId);

  const query = useQuery<DaysCache>({
    queryKey,
    queryFn: () => apiGetDays(planId),
    initialData: initialDays,
    staleTime: 5_000,
  });

  const days = query.data ?? [];

  const addDayMutation = useMutation({
    mutationFn: () => apiAddDay(planId),
    onSuccess: (newDay) => {
      queryClient.setQueryData<DaysCache>(queryKey, (cache) =>
        patchDays(cache, (prev) => [...prev, newDay].sort((a, b) => a.day_number - b.day_number)),
      );
    },
  });

  const removeDayMutation = useMutation({
    mutationFn: (dayId: string) => apiRemoveDay(planId, dayId),
    onMutate: async (dayId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<DaysCache>(queryKey);
      queryClient.setQueryData<DaysCache>(queryKey, (cache) =>
        patchDays(cache, (prev) => prev.filter((day) => day.id !== dayId)),
      );
      return { previous };
    },
    onError: (_err, _dayId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
  });

  const addItemMutation = useMutation({
    mutationFn: ({ dayId, payload }: { dayId: string; payload: AddItemPayload }) =>
      apiAddItem(planId, dayId, payload),
    onSuccess: (newItem, { dayId }) => {
      queryClient.setQueryData<DaysCache>(queryKey, (cache) =>
        patchDays(cache, (prev) =>
          prev.map((day) =>
            day.id === dayId ? { ...day, items: sortItems([...day.items, newItem]) } : day,
          ),
        ),
      );
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: ({ itemId }: { dayId: string; itemId: string }) => apiRemoveItem(planId, itemId),
    onMutate: async ({ dayId, itemId }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<DaysCache>(queryKey);
      queryClient.setQueryData<DaysCache>(queryKey, (cache) =>
        patchDays(cache, (prev) =>
          prev.map((day) =>
            day.id === dayId
              ? { ...day, items: day.items.filter((item) => item.id !== itemId) }
              : day,
          ),
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: ({ itemId, notes }: { dayId: string; itemId: string; notes: string | null }) =>
      apiUpdateItemNotes(planId, itemId, notes),
    onSuccess: (updatedItem, { dayId }) => {
      queryClient.setQueryData<DaysCache>(queryKey, (cache) =>
        patchDays(cache, (prev) =>
          prev.map((day) =>
            day.id === dayId
              ? {
                  ...day,
                  items: day.items.map((item) =>
                    item.id === updatedItem.id ? updatedItem : item,
                  ),
                }
              : day,
          ),
        ),
      );
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (entries: ReorderEntry[]) => apiReorderItems(planId, entries),
    onMutate: async (entries) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<DaysCache>(queryKey);
      const updatesById = new Map(entries.map((entry) => [entry.id, entry] as const));
      queryClient.setQueryData<DaysCache>(queryKey, (cache) =>
        patchDays(cache, (prev) => {
          const allItems = prev.flatMap((day) => day.items);
          const patched = allItems.map((item) => {
            const patch = updatesById.get(item.id);
            if (!patch) return item;
            return {
              ...item,
              sort_key: patch.sort_key,
              day_id: patch.day_id,
              destination_id: patch.destination_id ?? null,
            };
          });
          return prev.map((day) => ({
            ...day,
            items: sortItems(patched.filter((item) => item.day_id === day.id)),
          }));
        }),
      );
      return { previous };
    },
    onError: (_err, _entries, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const updateDayNotesMutation = useMutation({
    mutationFn: ({ dayId, notes }: { dayId: string; notes: string | null }) =>
      apiUpdateDay(planId, dayId, { notes }),
    onMutate: async ({ dayId, notes }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<DaysCache>(queryKey);
      queryClient.setQueryData<DaysCache>(queryKey, (cache) =>
        patchDays(cache, (prev) =>
          prev.map((day) => (day.id === dayId ? { ...day, notes } : day)),
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
  });

  const isLoading =
    addDayMutation.isPending ||
    removeDayMutation.isPending ||
    addItemMutation.isPending ||
    removeItemMutation.isPending ||
    updateNotesMutation.isPending ||
    reorderMutation.isPending ||
    updateDayNotesMutation.isPending;

  const addItem = useCallback(
    (dayId: string, payload: AddItemPayload) => addItemMutation.mutateAsync({ dayId, payload }),
    [addItemMutation],
  );
  const updateDayNotes = useCallback(
    (dayId: string, notes: string | null) => updateDayNotesMutation.mutateAsync({ dayId, notes }),
    [updateDayNotesMutation],
  );
  const reorder = useCallback(
    (entries: ReorderEntry[]) => reorderMutation.mutateAsync(entries),
    [reorderMutation],
  );

  return {
    days,
    addDay: () => addDayMutation.mutateAsync(),
    removeDay: (dayId: string) => removeDayMutation.mutate(dayId),
    addItem,
    removeItem: (dayId: string, itemId: string) => removeItemMutation.mutate({ dayId, itemId }),
    updateItemNotes: (dayId: string, itemId: string, notes: string | null) =>
      updateNotesMutation.mutate({ dayId, itemId, notes }),
    reorderItems: reorder,
    updateDayNotes,
    isLoading,
  };
}
