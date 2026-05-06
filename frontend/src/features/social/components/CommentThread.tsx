"use client";

import { useState } from "react";
import { CornerDownRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ProfileSummary } from "@/lib/api";
import type { CommentSnapshot } from "@/lib/yjs/hooks";

interface Props {
  comment: CommentSnapshot;
  replies: CommentSnapshot[];
  currentUserId: string | null;
  isPlanOwner: boolean;
  resolveAuthor: (userId: string | null) => ProfileSummary | null;
  onReply: (parentId: string, body: string) => void;
  onDelete: (commentId: string) => void;
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
  return date.toLocaleDateString();
}

function authorLabel(comment: CommentSnapshot, profile: ProfileSummary | null): string {
  if (comment.deleted_at) return "removed";
  return profile?.display_name ?? profile?.username ?? "Someone";
}

function authorInitials(profile: ProfileSummary | null): string {
  const name = profile?.display_name ?? profile?.username ?? "?";
  return name.slice(0, 2).toUpperCase();
}

export default function CommentThread({
  comment,
  replies,
  currentUserId,
  isPlanOwner,
  resolveAuthor,
  onReply,
  onDelete,
}: Props) {
  const [isReplying, setIsReplying] = useState(false);
  const [draft, setDraft] = useState("");

  const isDeleted = comment.deleted_at != null;
  const canDelete =
    !isDeleted && (currentUserId === comment.author_id || isPlanOwner);
  const profile = resolveAuthor(comment.author_id);

  function submitReply() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    try {
      onReply(comment.id, trimmed);
      setDraft("");
      setIsReplying(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't post reply";
      toast.error(message);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <Avatar size="sm">
          {profile?.avatar_url ? (
            <AvatarImage src={profile.avatar_url} alt={authorLabel(comment, profile)} />
          ) : null}
          <AvatarFallback className="text-[10px]">{authorInitials(profile)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 text-xs">
            <span className={cn("font-medium", isDeleted ? "italic text-ink-subtle" : "text-ink")}>
              {authorLabel(comment, profile)}
            </span>
            <span className="text-ink-subtle">{formatTimestamp(comment.created_at)}</span>
          </div>
          <p
            className={cn(
              "whitespace-pre-wrap break-words text-sm",
              isDeleted ? "italic text-ink-subtle" : "text-ink",
            )}
          >
            {isDeleted ? "comment removed" : comment.body}
          </p>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-subtle">
            {!isDeleted ? (
              <button
                type="button"
                onClick={() => setIsReplying((value) => !value)}
                className="hover:text-ink"
              >
                Reply
              </button>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                onClick={() => onDelete(comment.id)}
                className="inline-flex items-center gap-1 hover:text-destructive"
              >
                <Trash2 className="size-3" strokeWidth={1.5} />
                Delete
              </button>
            ) : null}
          </div>

          {isReplying ? (
            <div className="mt-2 space-y-2">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write a reply…"
                rows={2}
                className="text-sm"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={submitReply}
                  disabled={draft.trim().length === 0}
                >
                  Post reply
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsReplying(false);
                    setDraft("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {replies.length > 0 ? (
        <ul className="ml-7 space-y-2 border-l border-border pl-3">
          {replies.map((reply) => {
            const replyDeleted = reply.deleted_at != null;
            const replyProfile = resolveAuthor(reply.author_id);
            const replyLabel = authorLabel(reply, replyProfile);
            const canDeleteReply =
              !replyDeleted &&
              (currentUserId === reply.author_id || isPlanOwner);
            return (
              <li key={reply.id} className="flex items-start gap-2">
                <CornerDownRight
                  className="mt-1 size-3.5 shrink-0 text-ink-subtle"
                  strokeWidth={1.5}
                />
                <Avatar size="sm">
                  {replyProfile?.avatar_url ? (
                    <AvatarImage src={replyProfile.avatar_url} alt={replyLabel} />
                  ) : null}
                  <AvatarFallback className="text-[10px]">
                    {authorInitials(replyProfile)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 text-xs">
                    <span
                      className={cn(
                        "font-medium",
                        replyDeleted ? "italic text-ink-subtle" : "text-ink",
                      )}
                    >
                      {replyLabel}
                    </span>
                    <span className="text-ink-subtle">
                      {formatTimestamp(reply.created_at)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "whitespace-pre-wrap break-words text-sm",
                      replyDeleted ? "italic text-ink-subtle" : "text-ink",
                    )}
                  >
                    {replyDeleted ? "comment removed" : reply.body}
                  </p>
                  {canDeleteReply ? (
                    <button
                      type="button"
                      onClick={() => onDelete(reply.id)}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink-subtle hover:text-destructive"
                    >
                      <Trash2 className="size-3" strokeWidth={1.5} />
                      Delete
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
