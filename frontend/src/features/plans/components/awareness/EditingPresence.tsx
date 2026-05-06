"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRemoteAwareness } from "@/lib/yjs/hooks";
import type { EditingKind } from "@/lib/yjs/schema";
import { usePlanCollab } from "@/features/plans/hooks/PlanCollabContext";

interface Props {
  kind: EditingKind;
  id: string;
  /** Suffix added to the tooltip after the user name. Defaults to "is here". */
  verb?: string;
}

function initials(displayName: string | null, username: string | null): string {
  const name = displayName ?? username ?? "?";
  return name.slice(0, 2).toUpperCase();
}

/**
 * Tiny avatar pill rendered next to a free-text editing surface (day
 * notes, item notes, comment composer). Shows remote clients whose
 * awareness `editing` exactly matches `(kind, id)`. Renders nothing
 * when no one (else) is editing — stays out of the way visually.
 */
export default function EditingPresence({ kind, id, verb = "is editing" }: Props) {
  const { provider } = usePlanCollab();
  const remote = useRemoteAwareness(provider);
  const here = remote.filter(
    (entry) => entry.editing?.kind === kind && entry.editing?.id === id,
  );
  if (here.length === 0) return null;
  const visible = here.slice(0, 3);
  const overflow = here.length - visible.length;

  return (
    <div className="flex -space-x-2">
      {visible.map((entry) => {
        const label = entry.user.displayName ?? entry.user.username ?? "Someone";
        return (
          <Tooltip key={entry.clientId}>
            <TooltipTrigger asChild>
              <Avatar
                size="sm"
                className="border-2 border-card ring-1 ring-primary/40"
              >
                {entry.user.avatarUrl ? (
                  <AvatarImage src={entry.user.avatarUrl} alt={label} />
                ) : null}
                <AvatarFallback className="text-[9px]">
                  {initials(entry.user.displayName, entry.user.username)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="top">
              {label} {verb}
            </TooltipContent>
          </Tooltip>
        );
      })}
      {overflow > 0 ? (
        <span className="ml-2 inline-flex h-6 items-center rounded-full bg-muted px-2 text-[10px] font-medium text-ink-subtle">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
