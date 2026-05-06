"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
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
import type { PlanRole } from "@/lib/api";
import { usePlanMembers } from "@/features/social/hooks/usePlanMembers";

interface MembersTabProps {
  planId: string;
  isOwner: boolean;
}

const ROLE_BADGE_VARIANT: Record<PlanRole, "default" | "secondary" | "outline"> = {
  owner: "default",
  editor: "secondary",
  viewer: "outline",
};

export default function MembersTab({ planId, isOwner }: MembersTabProps) {
  const { members, isLoading, changeRole, removeMember, isMutating } =
    usePlanMembers(planId);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleRoleChange(userId: string, nextRole: PlanRole) {
    setPendingId(userId);
    try {
      await changeRole(userId, nextRole);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't update role";
      toast.error(message);
    } finally {
      setPendingId(null);
    }
  }

  async function handleRemove(userId: string) {
    setPendingId(userId);
    try {
      await removeMember(userId);
      toast.success("Member removed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't remove member";
      toast.error(message);
    } finally {
      setPendingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
      </div>
    );
  }

  if (members.length === 0) {
    return <p className="text-sm text-ink-subtle">No members yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {members.map((member) => {
        const initials =
          (member.profile.display_name ?? member.profile.username ?? "?")
            .slice(0, 2)
            .toUpperCase();
        const fullName = member.profile.display_name ?? member.profile.username;
        const isOwnerRow = member.role === "owner";
        const canMutate = isOwner && !isOwnerRow;
        const rowBusy = isMutating && pendingId === member.user_id;

        return (
          <li
            key={member.user_id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="size-10">
                {member.profile.avatar_url ? (
                  <AvatarImage src={member.profile.avatar_url} alt={fullName} />
                ) : null}
                <AvatarFallback className="text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{fullName}</p>
                <p className="truncate text-xs text-ink-subtle">@{member.profile.username}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {canMutate ? (
                <Select
                  value={member.role}
                  onValueChange={(value) => handleRoleChange(member.user_id, value as PlanRole)}
                  disabled={rowBusy}
                >
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant={ROLE_BADGE_VARIANT[member.role]} className="capitalize">
                  {member.role}
                </Badge>
              )}

              {canMutate ? (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleRemove(member.user_id)}
                  disabled={rowBusy}
                  aria-label={`Remove ${fullName}`}
                >
                  <Trash2 className="size-4" strokeWidth={1.5} />
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
