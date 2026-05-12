"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createHotel as apiCreateHotel,
  deleteHotel as apiDeleteHotel,
  listHotels as apiListHotels,
  updateHotel as apiUpdateHotel,
  type CreateHotelPayload,
  type PlanHotel,
  type UpdateHotelPayload,
} from "@/lib/api";

export interface UseHotelsReturn {
  hotels: PlanHotel[];
  isLoading: boolean;
  createHotel: (payload: CreateHotelPayload) => Promise<PlanHotel>;
  updateHotel: (hotelId: string, payload: UpdateHotelPayload) => Promise<PlanHotel>;
  deleteHotel: (hotelId: string) => Promise<void>;
  isMutating: boolean;
}

function hotelsKey(planId: string): readonly ["plan-hotels", string] {
  return ["plan-hotels", planId] as const;
}

export function useHotels(planId: string): UseHotelsReturn {
  const queryClient = useQueryClient();
  const queryKey = hotelsKey(planId);

  const query = useQuery<PlanHotel[]>({
    queryKey,
    queryFn: () => apiListHotels(planId),
    staleTime: 5_000,
    // Persist so the workspace can render hotels offline from the cache.
    meta: { persist: true },
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateHotelPayload) => apiCreateHotel(planId, payload),
    onSuccess: (newHotel) => {
      queryClient.setQueryData<PlanHotel[]>(queryKey, (cache) =>
        [...(cache ?? []), newHotel].sort(
          (a, b) => a.check_in_day_number - b.check_in_day_number,
        ),
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ hotelId, payload }: { hotelId: string; payload: UpdateHotelPayload }) =>
      apiUpdateHotel(planId, hotelId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData<PlanHotel[]>(queryKey, (cache) =>
        (cache ?? []).map((hotel) => (hotel.id === updated.id ? updated : hotel)),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (hotelId: string) => apiDeleteHotel(planId, hotelId),
    onMutate: async (hotelId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PlanHotel[]>(queryKey);
      queryClient.setQueryData<PlanHotel[]>(queryKey, (cache) =>
        (cache ?? []).filter((hotel) => hotel.id !== hotelId),
      );
      return { previous };
    },
    onError: (_err, _hotelId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
  });

  return {
    hotels: query.data ?? [],
    isLoading: query.isLoading,
    createHotel: (payload) => createMutation.mutateAsync(payload),
    updateHotel: (hotelId, payload) => updateMutation.mutateAsync({ hotelId, payload }),
    deleteHotel: (hotelId) => deleteMutation.mutateAsync(hotelId),
    isMutating:
      createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
