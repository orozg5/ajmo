"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Friendship, ProfileSummary } from "@/lib/api";
import { useFriends } from "@/features/social/hooks/useFriends";
import { useUserSearch } from "@/features/social/hooks/useUserSearch";

import FriendListRow from "./FriendListRow";

interface FriendSearchBarProps {
  friends: Friendship[];
  incoming: Friendship[];
  outgoing: Friendship[];
}

type Relationship = "friend" | "incoming" | "outgoing" | "none";

const RELATIONSHIP_HINT: Record<Exclude<Relationship, "none">, string> = {
  friend: "Already friends",
  incoming: "Sent you a request",
  outgoing: "Request sent",
};

export default function FriendSearchBar({ friends, incoming, outgoing }: FriendSearchBarProps) {
  const { query, setQuery, results, isLoading } = useUserSearch();
  const { sendRequest, isMutating } = useFriends();

  const relationships = useMemo(() => {
    const map = new Map<string, Relationship>();
    // Order matters: accepted overrides any pending state.
    for (const edge of incoming) map.set(edge.other.id, "incoming");
    for (const edge of outgoing) map.set(edge.other.id, "outgoing");
    for (const edge of friends) map.set(edge.other.id, "friend");
    return map;
  }, [friends, incoming, outgoing]);

  async function handleSend(profile: ProfileSummary) {
    try {
      await sendRequest(profile.username);
      toast.success(`Friend request sent to ${profile.username}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't send request";
      toast.error(message);
    }
  }

  return (
    <section className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
          strokeWidth={1.5}
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find friends by username or display name…"
          className="pl-9"
          aria-label="Search users"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      ) : null}

      {!isLoading && query.trim().length > 0 && results.length === 0 ? (
        <p className="text-sm text-ink-subtle">
          No users matched &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="space-y-2">
          {results.map((profile) => {
            const relationship = relationships.get(profile.id) ?? "none";
            const hint =
              relationship === "none" ? undefined : RELATIONSHIP_HINT[relationship];
            return (
              <FriendListRow
                key={profile.id}
                profile={profile}
                hint={hint}
                busy={isMutating || relationship !== "none"}
                actions={
                  relationship === "none"
                    ? [{ kind: "send", onClick: () => handleSend(profile) }]
                    : []
                }
              />
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
