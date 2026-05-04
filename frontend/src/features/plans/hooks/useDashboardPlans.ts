"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { listPlans, type Plan } from "@/lib/api";

type DashboardQuery = UseQueryResult<Plan[], Error>;

export type UseDashboardPlansReturn = {
  owner: DashboardQuery;
  member: DashboardQuery;
  publicScope: DashboardQuery;
};

export function useDashboardPlans(): UseDashboardPlansReturn {
  const owner = useQuery<Plan[], Error>({
    queryKey: ["plans", "owner"],
    queryFn: () => listPlans("owner"),
    // persist: true — owner lists are the primary thing we'd want offline.
    meta: { persist: true },
  });

  const member = useQuery<Plan[], Error>({
    queryKey: ["plans", "member"],
    queryFn: () => listPlans("member"),
    meta: { persist: true },
  });

  const publicScope = useQuery<Plan[], Error>({
    queryKey: ["plans", "public"],
    queryFn: () => listPlans("public"),
  });

  return { owner, member, publicScope };
}
