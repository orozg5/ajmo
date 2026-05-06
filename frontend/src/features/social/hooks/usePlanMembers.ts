"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addPlanMember,
  type InvitableRole,
  listPlanMembers,
  type PlanMember,
  type PlanRole,
  removePlanMember,
  updatePlanMemberRole,
} from "@/lib/api";

const planMembersKey = (planId: string) => ["plan-members", planId] as const;

export interface UsePlanMembersReturn {
  members: PlanMember[];
  isLoading: boolean;
  addMember: (userId: string, role: InvitableRole) => Promise<PlanMember>;
  changeRole: (userId: string, role: PlanRole) => Promise<PlanMember>;
  removeMember: (userId: string) => Promise<void>;
  isMutating: boolean;
}

export function usePlanMembers(planId: string): UsePlanMembersReturn {
  const queryClient = useQueryClient();
  const queryKey = planMembersKey(planId);

  const query = useQuery<PlanMember[]>({
    queryKey,
    queryFn: () => listPlanMembers(planId),
    enabled: Boolean(planId),
  });

  const addMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: InvitableRole }) =>
      addPlanMember(planId, userId, role),
    onSuccess: (newMember) => {
      queryClient.setQueryData<PlanMember[]>(queryKey, (cache) => {
        if (!cache) return [newMember];
        const existing = cache.findIndex((m) => m.user_id === newMember.user_id);
        if (existing >= 0) {
          const next = [...cache];
          next[existing] = newMember;
          return next;
        }
        return [...cache, newMember];
      });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: PlanRole }) =>
      updatePlanMemberRole(planId, userId, role),
    onSuccess: (updated) => {
      queryClient.setQueryData<PlanMember[]>(queryKey, (cache) =>
        cache?.map((member) =>
          member.user_id === updated.user_id ? { ...member, role: updated.role } : member,
        ) ?? [],
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removePlanMember(planId, userId),
    onSuccess: (_void, userId) => {
      queryClient.setQueryData<PlanMember[]>(queryKey, (cache) =>
        cache?.filter((member) => member.user_id !== userId) ?? [],
      );
    },
  });

  return {
    members: query.data ?? [],
    isLoading: query.isLoading,
    addMember: (userId, role) => addMutation.mutateAsync({ userId, role }),
    changeRole: (userId, role) => changeRoleMutation.mutateAsync({ userId, role }),
    removeMember: (userId) => removeMutation.mutateAsync(userId),
    isMutating:
      addMutation.isPending || changeRoleMutation.isPending || removeMutation.isPending,
  };
}
