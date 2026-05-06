"use client";

import { useMemo } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRemoteAwareness } from "@/lib/yjs/hooks";
import { usePlanCollab } from "@/features/plans/hooks/PlanCollabContext";

function initials(displayName: string | null, username: string | null): string {
  const name = displayName ?? username ?? "?";
  return name.slice(0, 2).toUpperCase();
}

/**
 * Top-right presence strip in the plan header — shows every connected
 * collaborator including yourself. Distinct user-ids are shown once even
 * if a user has the plan open in multiple tabs.
 */
export default function PresenceStrip() {
  const { provider, currentUser } = usePlanCollab();
  const remote = useRemoteAwareness(provider);

  const everyone = useMemo(() => {
    type Entry = {
      userId: string;
      displayName: string | null;
      username: string | null;
      avatarUrl: string | null;
      isYou: boolean;
    };
    const seen = new Map<string, Entry>();
    if (currentUser) {
      seen.set(currentUser.id, {
        userId: currentUser.id,
        displayName: currentUser.displayName,
        username: currentUser.username,
        avatarUrl: currentUser.avatarUrl,
        isYou: true,
      });
    }
    for (const entry of remote) {
      if (seen.has(entry.user.id)) continue;
      seen.set(entry.user.id, {
        userId: entry.user.id,
        displayName: entry.user.displayName,
        username: entry.user.username,
        avatarUrl: entry.user.avatarUrl,
        isYou: false,
      });
    }
    return Array.from(seen.values());
  }, [remote, currentUser]);

  if (everyone.length === 0) return null;

  const visible = everyone.slice(0, 5);
  const overflow = everyone.length - visible.length;

  return (
    <div className="flex -space-x-2">
      {visible.map((entry) => (
        <Tooltip key={entry.userId}>
          <TooltipTrigger asChild>
            <Avatar className="size-9 border-2 border-card">
              {entry.avatarUrl ? (
                <AvatarImage
                  src={entry.avatarUrl}
                  alt={entry.displayName ?? entry.username ?? "Member"}
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {entry.isYou ? "You" : initials(entry.displayName, entry.username)}
              </AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent>
            {entry.isYou
              ? "You"
              : entry.displayName ?? entry.username ?? "Anonymous"}
          </TooltipContent>
        </Tooltip>
      ))}
      {overflow > 0 ? (
        <span className="ml-2 inline-flex h-9 items-center rounded-full bg-muted px-2 text-[11px] font-medium text-ink-subtle">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
