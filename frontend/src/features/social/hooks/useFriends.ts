"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  acceptFriendRequest,
  cancelFriendRequest,
  type Friendship,
  listFriends,
  listIncomingRequests,
  listOutgoingRequests,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest,
} from "@/lib/api";

const FRIENDS_KEY = ["social", "friends"] as const;
const INCOMING_KEY = ["social", "friends", "incoming"] as const;
const OUTGOING_KEY = ["social", "friends", "outgoing"] as const;

export interface UseFriendsReturn {
  friends: Friendship[];
  incoming: Friendship[];
  outgoing: Friendship[];
  isLoading: boolean;
  sendRequest: (username: string) => Promise<Friendship>;
  acceptRequest: (requestId: string) => Promise<Friendship>;
  rejectRequest: (requestId: string) => Promise<Friendship>;
  cancelRequest: (requestId: string) => Promise<void>;
  unfriend: (userId: string) => Promise<void>;
  isMutating: boolean;
}

export function useFriends(): UseFriendsReturn {
  const queryClient = useQueryClient();

  // Polling because friend-status changes are driven by the *other* party.
  // 5s feels live without thrashing the API; the queries are tiny.
  const friendsQuery = useQuery<Friendship[]>({
    queryKey: FRIENDS_KEY,
    queryFn: listFriends,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });
  const incomingQuery = useQuery<Friendship[]>({
    queryKey: INCOMING_KEY,
    queryFn: listIncomingRequests,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });
  const outgoingQuery = useQuery<Friendship[]>({
    queryKey: OUTGOING_KEY,
    queryFn: listOutgoingRequests,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });

  const sendMutation = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: (request) => {
      queryClient.setQueryData<Friendship[]>(OUTGOING_KEY, (cache) =>
        cache ? [request, ...cache] : [request],
      );
    },
  });

  const acceptMutation = useMutation({
    mutationFn: acceptFriendRequest,
    onSuccess: (request) => {
      queryClient.setQueryData<Friendship[]>(INCOMING_KEY, (cache) =>
        cache?.filter((entry) => entry.id !== request.id) ?? [],
      );
      queryClient.setQueryData<Friendship[]>(FRIENDS_KEY, (cache) =>
        cache ? [request, ...cache] : [request],
      );
    },
  });

  const rejectMutation = useMutation({
    mutationFn: rejectFriendRequest,
    onSuccess: (request) => {
      queryClient.setQueryData<Friendship[]>(INCOMING_KEY, (cache) =>
        cache?.filter((entry) => entry.id !== request.id) ?? [],
      );
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelFriendRequest,
    onSuccess: (_void, requestId) => {
      queryClient.setQueryData<Friendship[]>(OUTGOING_KEY, (cache) =>
        cache?.filter((entry) => entry.id !== requestId) ?? [],
      );
    },
  });

  const unfriendMutation = useMutation({
    mutationFn: removeFriend,
    onSuccess: (_void, userId) => {
      queryClient.setQueryData<Friendship[]>(FRIENDS_KEY, (cache) =>
        cache?.filter((entry) => entry.other.id !== userId) ?? [],
      );
    },
  });

  return {
    friends: friendsQuery.data ?? [],
    incoming: incomingQuery.data ?? [],
    outgoing: outgoingQuery.data ?? [],
    isLoading:
      friendsQuery.isLoading || incomingQuery.isLoading || outgoingQuery.isLoading,
    sendRequest: (username) => sendMutation.mutateAsync(username),
    acceptRequest: (requestId) => acceptMutation.mutateAsync(requestId),
    rejectRequest: (requestId) => rejectMutation.mutateAsync(requestId),
    cancelRequest: (requestId) => cancelMutation.mutateAsync(requestId),
    unfriend: (userId) => unfriendMutation.mutateAsync(userId),
    isMutating:
      sendMutation.isPending ||
      acceptMutation.isPending ||
      rejectMutation.isPending ||
      cancelMutation.isPending ||
      unfriendMutation.isPending,
  };
}
