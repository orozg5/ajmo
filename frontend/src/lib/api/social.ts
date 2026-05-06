import { apiFetch } from "./client";

export type PlanRole = "viewer" | "editor" | "owner";
export type InvitableRole = Exclude<PlanRole, "owner">;
export type FriendshipStatus = "pending" | "accepted" | "rejected";

export interface ProfileSummary {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  other: ProfileSummary;
}

export interface PlanMember {
  plan_id: string;
  user_id: string;
  role: PlanRole;
  joined_at: string;
  profile: ProfileSummary;
}

export interface PlanInvite {
  id: string;
  plan_id: string;
  token: string;
  role: PlanRole;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  created_by: string | null;
  created_at: string;
}

export interface CreateInvitePayload {
  role: InvitableRole;
  expires_in_hours?: number | null;
  max_uses?: number | null;
}

export interface InviteAcceptResponse {
  plan_id: string;
  role: PlanRole;
}

export const searchUsers = (q: string): Promise<ProfileSummary[]> => {
  const params = new URLSearchParams({ q });
  return apiFetch<ProfileSummary[]>(`/social/users/search?${params.toString()}`);
};

export const listFriends = (): Promise<Friendship[]> =>
  apiFetch<Friendship[]>("/social/friends");

export const listIncomingRequests = (): Promise<Friendship[]> =>
  apiFetch<Friendship[]>("/social/friends/incoming");

export const listOutgoingRequests = (): Promise<Friendship[]> =>
  apiFetch<Friendship[]>("/social/friends/outgoing");

export const sendFriendRequest = (username: string): Promise<Friendship> =>
  apiFetch<Friendship>("/social/friends/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });

export const acceptFriendRequest = (requestId: string): Promise<Friendship> =>
  apiFetch<Friendship>(`/social/friends/accept/${requestId}`, { method: "POST" });

export const rejectFriendRequest = (requestId: string): Promise<Friendship> =>
  apiFetch<Friendship>(`/social/friends/reject/${requestId}`, { method: "POST" });

export const cancelFriendRequest = (requestId: string): Promise<void> =>
  apiFetch<void>(`/social/friends/requests/${requestId}`, { method: "DELETE" });

export const removeFriend = (userId: string): Promise<void> =>
  apiFetch<void>(`/social/friends/${userId}`, { method: "DELETE" });

export const listPlanMembers = (planId: string): Promise<PlanMember[]> =>
  apiFetch<PlanMember[]>(`/plans/${planId}/members`);

export const addPlanMember = (
  planId: string,
  userId: string,
  role: InvitableRole,
): Promise<PlanMember> =>
  apiFetch<PlanMember>(`/plans/${planId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, role }),
  });

export const getMyPlanRole = (
  planId: string,
  accessToken?: string | null,
): Promise<{ role: PlanRole }> =>
  apiFetch<{ role: PlanRole }>(`/plans/${planId}/role`, undefined, accessToken);

export const updatePlanMemberRole = (
  planId: string,
  userId: string,
  role: PlanRole,
): Promise<PlanMember> =>
  apiFetch<PlanMember>(`/plans/${planId}/members/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });

export const removePlanMember = (planId: string, userId: string): Promise<void> =>
  apiFetch<void>(`/plans/${planId}/members/${userId}`, { method: "DELETE" });

export const listPlanInvites = (planId: string): Promise<PlanInvite[]> =>
  apiFetch<PlanInvite[]>(`/plans/${planId}/invites`);

export const createPlanInvite = (
  planId: string,
  payload: CreateInvitePayload,
): Promise<PlanInvite> =>
  apiFetch<PlanInvite>(`/plans/${planId}/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const revokePlanInvite = (planId: string, inviteId: string): Promise<void> =>
  apiFetch<void>(`/plans/${planId}/invites/${inviteId}`, { method: "DELETE" });

export const acceptInvite = (
  token: string,
  accessToken?: string | null,
): Promise<InviteAcceptResponse> =>
  apiFetch<InviteAcceptResponse>(
    `/invite/${token}/accept`,
    { method: "POST" },
    accessToken,
  );
