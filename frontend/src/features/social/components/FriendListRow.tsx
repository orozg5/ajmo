"use client";

import { Check, UserMinus, UserPlus, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { ProfileSummary } from "@/lib/api";

type Action =
  | { kind: "accept"; onClick: () => void }
  | { kind: "reject"; onClick: () => void }
  | { kind: "cancel"; onClick: () => void }
  | { kind: "unfriend"; onClick: () => void }
  | { kind: "send"; onClick: () => void };

interface FriendListRowProps {
  profile: ProfileSummary;
  actions: Action[];
  busy?: boolean;
  hint?: string;
}

const ACTION_META: Record<Action["kind"], { label: string; Icon: typeof Check; variant: "default" | "outline" | "ghost" | "destructive" }> = {
  accept: { label: "Accept", Icon: Check, variant: "default" },
  reject: { label: "Reject", Icon: X, variant: "outline" },
  cancel: { label: "Cancel", Icon: X, variant: "outline" },
  unfriend: { label: "Unfriend", Icon: UserMinus, variant: "outline" },
  send: { label: "Add friend", Icon: UserPlus, variant: "default" },
};

export default function FriendListRow({ profile, actions, busy, hint }: FriendListRowProps) {
  const initials =
    (profile.display_name ?? profile.username ?? "?").slice(0, 2).toUpperCase();
  const fullName = profile.display_name ?? profile.username;

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-10">
          {profile.avatar_url ? (
            <AvatarImage src={profile.avatar_url} alt={fullName} />
          ) : null}
          <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{fullName}</p>
          <p className="truncate text-xs text-ink-subtle">
            @{profile.username}
            {hint ? <span className="ml-1.5 text-ink-subtle/70">· {hint}</span> : null}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {actions.map((action) => {
          const meta = ACTION_META[action.kind];
          const Icon = meta.Icon;
          return (
            <Button
              key={action.kind}
              size="sm"
              variant={meta.variant}
              onClick={action.onClick}
              disabled={busy}
            >
              <Icon className="size-4" strokeWidth={1.5} />
              {meta.label}
            </Button>
          );
        })}
      </div>
    </li>
  );
}
