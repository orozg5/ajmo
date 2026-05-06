"use client";

import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFriends } from "@/features/social/hooks/useFriends";

import FriendListRow from "./FriendListRow";
import FriendSearchBar from "./FriendSearchBar";

export default function FriendsExplorer() {
  const {
    friends,
    incoming,
    outgoing,
    isLoading,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    unfriend,
    isMutating,
  } = useFriends();

  async function handle(action: () => Promise<unknown>, message: string) {
    try {
      await action();
    } catch (error) {
      const detail = error instanceof Error ? error.message : message;
      toast.error(detail);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-display-lg leading-tight">Friends</h1>
        <p className="text-sm text-ink-subtle">
          Connect with other travellers. Friends can be invited to your plans with a viewer or
          editor role.
        </p>
      </header>

      <FriendSearchBar friends={friends} incoming={incoming} outgoing={outgoing} />

      <Tabs defaultValue="friends">
        <TabsList>
          <TabsTrigger value="friends">Friends ({friends.length})</TabsTrigger>
          <TabsTrigger value="incoming">Incoming ({incoming.length})</TabsTrigger>
          <TabsTrigger value="outgoing">Outgoing ({outgoing.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="friends" className="mt-4">
          {isLoading ? (
            <Skeleton className="h-14 rounded-xl" />
          ) : friends.length === 0 ? (
            <p className="text-sm text-ink-subtle">No friends yet.</p>
          ) : (
            <ul className="space-y-2">
              {friends.map((edge) => (
                <FriendListRow
                  key={edge.id}
                  profile={edge.other}
                  busy={isMutating}
                  actions={[
                    {
                      kind: "unfriend",
                      onClick: () =>
                        handle(() => unfriend(edge.other.id), "Couldn't unfriend"),
                    },
                  ]}
                />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="incoming" className="mt-4">
          {isLoading ? (
            <Skeleton className="h-14 rounded-xl" />
          ) : incoming.length === 0 ? (
            <p className="text-sm text-ink-subtle">No incoming requests.</p>
          ) : (
            <ul className="space-y-2">
              {incoming.map((edge) => (
                <FriendListRow
                  key={edge.id}
                  profile={edge.other}
                  busy={isMutating}
                  actions={[
                    {
                      kind: "accept",
                      onClick: () =>
                        handle(() => acceptRequest(edge.id), "Couldn't accept"),
                    },
                    {
                      kind: "reject",
                      onClick: () =>
                        handle(() => rejectRequest(edge.id), "Couldn't reject"),
                    },
                  ]}
                />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="outgoing" className="mt-4">
          {isLoading ? (
            <Skeleton className="h-14 rounded-xl" />
          ) : outgoing.length === 0 ? (
            <p className="text-sm text-ink-subtle">No pending requests.</p>
          ) : (
            <ul className="space-y-2">
              {outgoing.map((edge) => (
                <FriendListRow
                  key={edge.id}
                  profile={edge.other}
                  busy={isMutating}
                  actions={[
                    {
                      kind: "cancel",
                      onClick: () =>
                        handle(() => cancelRequest(edge.id), "Couldn't cancel"),
                    },
                  ]}
                />
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
