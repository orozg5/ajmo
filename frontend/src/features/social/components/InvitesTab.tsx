"use client";

import { useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { InvitableRole, PlanInvite } from "@/lib/api";
import { useInvites } from "@/features/social/hooks/useInvites";

interface InvitesTabProps {
  planId: string;
}

function buildInviteUrl(token: string): string {
  if (typeof window === "undefined") return `/invite/${token}`;
  return `${window.location.origin}/invite/${token}`;
}

function formatExpiry(invite: PlanInvite): string {
  if (!invite.expires_at) return "Never expires";
  const date = new Date(invite.expires_at);
  return `Expires ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

export default function InvitesTab({ planId }: InvitesTabProps) {
  const { invites, isLoading, createInvite, revokeInvite, isMutating } =
    useInvites(planId);

  const [role, setRole] = useState<InvitableRole>("viewer");
  const [expiresInHours, setExpiresInHours] = useState<string>("168");
  const [maxUses, setMaxUses] = useState<string>("");

  async function handleCreate() {
    const expires = expiresInHours.trim() ? Number(expiresInHours) : null;
    const uses = maxUses.trim() ? Number(maxUses) : null;
    if (expires !== null && (!Number.isFinite(expires) || expires <= 0)) {
      toast.error("Expiry must be a positive number of hours");
      return;
    }
    if (uses !== null && (!Number.isFinite(uses) || uses <= 0)) {
      toast.error("Max uses must be a positive integer");
      return;
    }

    try {
      const invite = await createInvite({
        role,
        expires_in_hours: expires,
        max_uses: uses,
      });
      const url = buildInviteUrl(invite.token);
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Invite link copied to clipboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't create invite";
      toast.error(message);
    }
  }

  async function handleCopy(token: string) {
    const url = buildInviteUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }

  async function handleRevoke(inviteId: string) {
    try {
      await revokeInvite(inviteId);
      toast.success("Invite revoked");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't revoke invite";
      toast.error(message);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-ink">Generate a new link</h3>
        <p className="text-xs text-ink-subtle">
          Anyone with the link can join with the role you set. Set an expiry or a use limit to
          tighten access.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="invite-role" className="text-xs font-medium text-ink">Role</label>
            <Select value={role} onValueChange={(value) => setRole(value as InvitableRole)}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="invite-expiry" className="text-xs font-medium text-ink">Expires in (hours)</label>
            <Input
              id="invite-expiry"
              type="number"
              min={1}
              value={expiresInHours}
              onChange={(event) => setExpiresInHours(event.target.value)}
              placeholder="Never"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="invite-uses" className="text-xs font-medium text-ink">Max uses</label>
            <Input
              id="invite-uses"
              type="number"
              min={1}
              value={maxUses}
              onChange={(event) => setMaxUses(event.target.value)}
              placeholder="Unlimited"
            />
          </div>
        </div>

        <Button className="mt-4" onClick={handleCreate} disabled={isMutating}>
          Generate link
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">Active links</h3>
        {isLoading ? (
          <Skeleton className="h-14 rounded-xl" />
        ) : invites.length === 0 ? (
          <p className="text-sm text-ink-subtle">No active links.</p>
        ) : (
          <ul className="space-y-2">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink capitalize">{invite.role} link</p>
                  <p className="truncate text-xs text-ink-subtle">
                    {formatExpiry(invite)} ·{" "}
                    {invite.max_uses === null
                      ? `${invite.uses} uses`
                      : `${invite.uses} / ${invite.max_uses} uses`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopy(invite.token)}
                  >
                    <Copy className="size-4" strokeWidth={1.5} />
                    Copy
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleRevoke(invite.id)}
                    disabled={isMutating}
                    aria-label="Revoke invite"
                  >
                    <Trash2 className="size-4" strokeWidth={1.5} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
