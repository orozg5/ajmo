"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { InvitableRole, PlanRole } from "@/lib/api";
import { useFriends } from "@/features/social/hooks/useFriends";
import { usePlanMembers } from "@/features/social/hooks/usePlanMembers";

interface AddFriendsTabProps {
  planId: string;
}

const ROLE_BADGE_VARIANT: Record<PlanRole, "default" | "secondary" | "outline"> = {
  owner: "default",
  editor: "secondary",
  viewer: "outline",
};

export default function AddFriendsTab({ planId }: AddFriendsTabProps) {
  const { friends, isLoading: friendsLoading } = useFriends();
  const { members, addMember, isMutating } = usePlanMembers(planId);
  const [selectedRole, setSelectedRole] = useState<InvitableRole>("viewer");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const memberByUserId = new Map(members.map((m) => [m.user_id, m]));

  async function handleAdd(userId: string) {
    setPendingId(userId);
    try {
      await addMember(userId, selectedRole);
      toast.success("Added to plan");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't add member";
      toast.error(message);
    } finally {
      setPendingId(null);
    }
  }

  if (friendsLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
        <span className="text-sm text-ink-subtle">Add friends as</span>
        <Select
          value={selectedRole}
          onValueChange={(value) => setSelectedRole(value as InvitableRole)}
        >
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {friends.length === 0 ? (
        <p className="text-sm text-ink-subtle">
          No friends yet. Find people on the Friends page and they&apos;ll appear here.
        </p>
      ) : (
        <ul className="space-y-2">
          {friends.map((edge) => {
            const profile = edge.other;
            const initials =
              (profile.display_name ?? profile.username ?? "?").slice(0, 2).toUpperCase();
            const fullName = profile.display_name ?? profile.username;
            const existingMember = memberByUserId.get(profile.id);
            const isPending = isMutating && pendingId === profile.id;

            return (
              <li
                key={profile.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-10">
                    {profile.avatar_url ? (
                      <AvatarImage src={profile.avatar_url} alt={fullName} />
                    ) : null}
                    <AvatarFallback className="text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{fullName}</p>
                    <p className="truncate text-xs text-ink-subtle">@{profile.username}</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {existingMember ? (
                    <Badge
                      variant={ROLE_BADGE_VARIANT[existingMember.role]}
                      className="capitalize"
                    >
                      {existingMember.role}
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleAdd(profile.id)}
                      disabled={isPending}
                    >
                      <UserPlus className="size-4" strokeWidth={1.5} />
                      Add
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
