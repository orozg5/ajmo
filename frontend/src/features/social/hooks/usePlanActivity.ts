"use client";

import { useQuery } from "@tanstack/react-query";

import { listActivity, type PlanActivity } from "@/lib/api";

export const activityKey = (planId: string) =>
  ["plan-activity", planId] as const;

export interface UsePlanActivityReturn {
  events: PlanActivity[];
  isLoading: boolean;
}

/**
 * Activity feed reader. Append-only history — re-fetch when the sheet
 * opens (`enabled` controlled by the caller passing null when closed) or
 * the user refocuses the tab. The live editing surfaces (likes, ratings,
 * comments, presence) are on Yjs/awareness; this is the slow audit trail.
 */
export function usePlanActivity(planId: string | null): UsePlanActivityReturn {
  const query = useQuery<PlanActivity[]>({
    queryKey: planId ? activityKey(planId) : ["plan-activity", "_disabled"],
    queryFn: () => listActivity(planId!, { limit: 50 }),
    enabled: planId !== null,
    refetchOnWindowFocus: true,
  });

  return {
    events: query.data ?? [],
    isLoading: query.isLoading,
  };
}
