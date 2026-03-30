"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  addDay as apiAddDay,
  removeDay as apiRemoveDay,
  addItem as apiAddItem,
  removeItem as apiRemoveItem,
  updateItemNotes as apiUpdateItemNotes,
  type PlanDay,
  type PlanItem,
  type AddItemPayload,
} from "@/lib/api";

interface UsePlanItineraryOptions {
  planId: string;
  initialDays: PlanDay[];
}

interface UsePlanItineraryReturn {
  days: PlanDay[];
  addDay: () => Promise<PlanDay>;
  removeDay: (dayId: string) => void;
  addItem: (dayId: string, payload: AddItemPayload) => void;
  removeItem: (dayId: string, itemId: string) => void;
  updateItemNotes: (dayId: string, itemId: string, notes: string | null) => void;
  isLoading: boolean;
}

export function usePlanItinerary({ planId, initialDays }: UsePlanItineraryOptions): UsePlanItineraryReturn {
  const [days, setDays] = useState<PlanDay[]>(initialDays);

  const addDayMutation = useMutation({
    mutationFn: () => apiAddDay(planId),
    onSuccess: (newDay: PlanDay) => {
      setDays((prev) => [...prev, newDay]);
    },
  });

  const removeDayMutation = useMutation({
    mutationFn: (dayId: string) => apiRemoveDay(planId, dayId),
    onSuccess: (_: void, dayId: string) => {
      setDays((prev) => prev.filter((d) => d.id !== dayId));
    },
  });

  const addItemMutation = useMutation({
    mutationFn: ({ dayId, payload }: { dayId: string; payload: AddItemPayload }) =>
      apiAddItem(planId, dayId, payload),
    onSuccess: (newItem: PlanItem, { dayId }: { dayId: string; payload: AddItemPayload }) => {
      setDays((prev) =>
        prev.map((d) =>
          d.id === dayId ? { ...d, items: [...d.items, newItem] } : d,
        ),
      );
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: ({ itemId }: { dayId: string; itemId: string }) =>
      apiRemoveItem(planId, itemId),
    onSuccess: (_: void, { dayId, itemId }: { dayId: string; itemId: string }) => {
      setDays((prev) =>
        prev.map((d) =>
          d.id === dayId ? { ...d, items: d.items.filter((item) => item.id !== itemId) } : d,
        ),
      );
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: ({ itemId, notes }: { dayId: string; itemId: string; notes: string | null }) =>
      apiUpdateItemNotes(planId, itemId, notes),
    onSuccess: (updatedItem: PlanItem, { dayId }: { dayId: string; itemId: string; notes: string | null }) => {
      setDays((prev) =>
        prev.map((d) =>
          d.id === dayId
            ? { ...d, items: d.items.map((item) => (item.id === updatedItem.id ? updatedItem : item)) }
            : d,
        ),
      );
    },
  });

  const isLoading =
    addDayMutation.isPending ||
    removeDayMutation.isPending ||
    addItemMutation.isPending ||
    removeItemMutation.isPending ||
    updateNotesMutation.isPending;

  return {
    days,
    addDay: () => addDayMutation.mutateAsync(),
    removeDay: (dayId: string) => removeDayMutation.mutate(dayId),
    addItem: (dayId: string, payload: AddItemPayload) =>
      addItemMutation.mutate({ dayId, payload }),
    removeItem: (dayId: string, itemId: string) =>
      removeItemMutation.mutate({ dayId, itemId }),
    updateItemNotes: (dayId: string, itemId: string, notes: string | null) =>
      updateNotesMutation.mutate({ dayId, itemId, notes }),
    isLoading,
  };
}
