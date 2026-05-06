"use client";

import {
  Activity,
  Bookmark,
  Heart,
  MessageCircle,
  Plus,
  Settings,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  UserMinus,
  UserPlus,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { ActivityKind, PlanActivity } from "@/lib/api";
import { usePlanActivity } from "@/features/social/hooks/usePlanActivity";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
}

const KIND_ICON: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  plan_created: Sparkles,
  member_added: UserPlus,
  member_removed: UserMinus,
  member_role_changed: Settings,
  comment_posted: MessageCircle,
  reaction_added: ThumbsUp,
  reaction_removed: ThumbsDown,
  rating_set: Star,
  rating_cleared: Star,
};

const REACTION_KIND_ICON: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  like: ThumbsUp,
  dislike: ThumbsDown,
  love: Heart,
  bookmark: Bookmark,
};

function pickIcon(event: PlanActivity) {
  if (event.kind === "reaction_added" || event.kind === "reaction_removed") {
    const kind = (event.payload?.kind as string | undefined) ?? "";
    return REACTION_KIND_ICON[kind] ?? KIND_ICON[event.kind] ?? Activity;
  }
  return KIND_ICON[event.kind] ?? Activity;
}

function actorName(event: PlanActivity): string {
  return event.actor?.display_name ?? event.actor?.username ?? "Someone";
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleString();
}

function describe(event: PlanActivity): string {
  const actor = actorName(event);
  const payload = event.payload ?? {};
  switch (event.kind as ActivityKind) {
    case "plan_created":
      return `${actor} created the plan${payload.title ? ` "${payload.title}"` : ""}.`;
    case "member_added":
      return `${actor} added a member${payload.role ? ` as ${payload.role}` : ""}.`;
    case "member_removed":
      return `${actor} removed a member.`;
    case "member_role_changed":
      return `${actor} updated a member's role${payload.role ? ` to ${payload.role}` : ""}.`;
    case "comment_posted":
      return payload.body_preview
        ? `${actor} commented: "${payload.body_preview}"`
        : `${actor} posted a comment.`;
    case "reaction_added":
      return payload.kind
        ? `${actor} reacted ${payload.kind} to an item.`
        : `${actor} reacted to an item.`;
    case "reaction_removed":
      return `${actor} removed a reaction.`;
    case "rating_set":
      return payload.stars
        ? `${actor} rated an item ${payload.stars}★.`
        : `${actor} rated an item.`;
    case "rating_cleared":
      return `${actor} cleared their rating.`;
    default:
      return `${actor} did something (${event.kind}).`;
  }
}

function actorInitials(event: PlanActivity): string {
  const name = event.actor?.display_name ?? event.actor?.username ?? "?";
  return name.slice(0, 2).toUpperCase();
}

export default function ActivitySheet({ open, onOpenChange, planId }: Props) {
  const { events, isLoading } = usePlanActivity(open ? planId : null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="pr-12">
          <SheetTitle className="inline-flex items-center gap-2">
            <Activity className="size-4" strokeWidth={1.5} />
            Activity
          </SheetTitle>
          <SheetDescription>
            What everyone has been doing on this trip, newest first.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {isLoading ? (
            <p className="text-sm text-ink-subtle">Loading activity…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-ink-subtle">
              <Plus className="mr-1 inline size-3.5" strokeWidth={1.5} />
              Nothing yet. Reactions, ratings, comments, and member changes show up here.
            </p>
          ) : (
            <ul className="space-y-3">
              {events.map((event) => {
                const Icon = pickIcon(event);
                return (
                  <li key={event.id} className="flex items-start gap-3 text-sm">
                    <Avatar size="sm">
                      {event.actor?.avatar_url ? (
                        <AvatarImage
                          src={event.actor.avatar_url}
                          alt={actorName(event)}
                        />
                      ) : null}
                      <AvatarFallback className="text-[10px]">
                        {actorInitials(event)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="break-words">
                        <Icon
                          className="mr-1 inline size-3.5 text-ink-subtle"
                          strokeWidth={1.5}
                        />
                        {describe(event)}
                      </p>
                      <p className="text-[11px] text-ink-subtle">
                        {formatTimestamp(event.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
