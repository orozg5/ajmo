"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CreateInvitePayload,
  createPlanInvite,
  listPlanInvites,
  type PlanInvite,
  revokePlanInvite,
} from "@/lib/api";

const invitesKey = (planId: string) => ["plan-invites", planId] as const;

export interface UseInvitesReturn {
  invites: PlanInvite[];
  isLoading: boolean;
  createInvite: (payload: CreateInvitePayload) => Promise<PlanInvite>;
  revokeInvite: (inviteId: string) => Promise<void>;
  isMutating: boolean;
}

export function useInvites(planId: string): UseInvitesReturn {
  const queryClient = useQueryClient();
  const queryKey = invitesKey(planId);

  const query = useQuery<PlanInvite[]>({
    queryKey,
    queryFn: () => listPlanInvites(planId),
    enabled: Boolean(planId),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateInvitePayload) => createPlanInvite(planId, payload),
    onSuccess: (invite) => {
      queryClient.setQueryData<PlanInvite[]>(queryKey, (cache) =>
        cache ? [invite, ...cache] : [invite],
      );
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => revokePlanInvite(planId, inviteId),
    onSuccess: (_void, inviteId) => {
      queryClient.setQueryData<PlanInvite[]>(queryKey, (cache) =>
        cache?.filter((invite) => invite.id !== inviteId) ?? [],
      );
    },
  });

  return {
    invites: query.data ?? [],
    isLoading: query.isLoading,
    createInvite: (payload) => createMutation.mutateAsync(payload),
    revokeInvite: (inviteId) => revokeMutation.mutateAsync(inviteId),
    isMutating: createMutation.isPending || revokeMutation.isPending,
  };
}
