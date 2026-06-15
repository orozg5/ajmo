"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, MessagesSquare } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { ProfileSummary } from "@/lib/api";
import { useRemoteAwareness, useYComments, type CommentSnapshot } from "@/lib/yjs/hooks";
import { deleteComment, postComment } from "@/lib/yjs/mutations";
import type { EditingKind } from "@/lib/yjs/schema";
import { useEditingReporter } from "@/features/plans/hooks/useEditingReporter";
import { usePlanCollab } from "@/features/plans/hooks/PlanCollabContext";
import { usePlanMembers } from "@/features/social/hooks/usePlanMembers";
import CommentThread from "@/features/social/components/CommentThread";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPlanOwner: boolean;
  /** null → plan-level "Chat" (only comments with plan_item_id === null).
   *  set → per-item comments (only comments where plan_item_id === scopedItemId). */
  scopedItemId: string | null;
  /** Item title used for the per-item sheet subtitle. Ignored when
   *  scopedItemId is null. */
  scopedItemTitle?: string | null;
}

export default function CommentsSheet({
  open,
  onOpenChange,
  isPlanOwner,
  scopedItemId,
  scopedItemTitle,
}: Props) {
  const { planId, doc, provider, currentUserId, role } = usePlanCollab();
  const canPost = role !== "viewer";
  const allComments = useYComments(doc);
  const remote = useRemoteAwareness(provider);
  const { members } = usePlanMembers(planId);

  const editingKind: EditingKind = scopedItemId ? "item_comment" : "chat";
  const editingId = scopedItemId ?? "plan";
  const { reportFocus, reportBlur } = useEditingReporter(editingKind, editingId);

  const authorById = useMemo(() => {
    const map = new Map<string, ProfileSummary>();
    for (const member of members) {
      if (member.profile?.id) map.set(member.profile.id, member.profile);
    }
    return map;
  }, [members]);

  const resolveAuthor = (userId: string | null): ProfileSummary | null => {
    if (!userId) return null;
    return authorById.get(userId) ?? null;
  };

  const scopedComments = useMemo(() => {
    return allComments.filter((comment) => comment.plan_item_id === scopedItemId);
  }, [allComments, scopedItemId]);

  const { roots, repliesByParent } = useMemo(() => {
    const roots: CommentSnapshot[] = [];
    const repliesByParent = new Map<string, CommentSnapshot[]>();
    for (const comment of scopedComments) {
      if (comment.parent_id) {
        const list = repliesByParent.get(comment.parent_id) ?? [];
        list.push(comment);
        repliesByParent.set(comment.parent_id, list);
      } else {
        roots.push(comment);
      }
    }
    return { roots, repliesByParent };
  }, [scopedComments]);

  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!open) setDraft("");
  }, [open]);

  // Clear our editing flag when the sheet closes — `useEditingReporter`
  // already clears on unmount, but the sheet stays mounted while the
  // overlay animates closed, so an explicit reportBlur on close avoids
  // a brief stuck pill on peers.
  useEffect(() => {
    if (!open) reportBlur();
  }, [open, reportBlur]);

  const typists = useMemo(() => {
    return remote.filter(
      (entry) =>
        entry.editing?.kind === editingKind && entry.editing?.id === editingId,
    );
  }, [remote, editingKind, editingId]);

  function submitTopLevel() {
    if (!canPost) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (!doc || !currentUserId) {
      toast.error("Not connected yet — try again in a moment.");
      return;
    }
    postComment(doc, {
      authorId: currentUserId,
      body: trimmed,
      planItemId: scopedItemId,
    });
    setDraft("");
  }

  function postReply(parentId: string, body: string) {
    if (!doc || !currentUserId) return;
    postComment(doc, {
      authorId: currentUserId,
      body,
      parentId,
      planItemId: scopedItemId,
    });
  }

  function removeComment(commentId: string) {
    if (!doc) return;
    deleteComment(doc, commentId);
  }

  const TitleIcon = scopedItemId ? MessageCircle : MessagesSquare;
  const titleLabel = scopedItemId ? "Comments" : "Chat";
  const description = scopedItemId
    ? scopedItemTitle
      ? `On "${scopedItemTitle}"`
      : "Comments on this item"
    : "Plan-wide chat with everyone on the trip.";
  const placeholder = scopedItemId
    ? "Comment on this item…"
    : "Say something to the group…";
  const emptyLabel = scopedItemId
    ? "No comments on this item yet."
    : "No messages yet. Start the conversation.";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="pr-12">
          <SheetTitle className="inline-flex items-center gap-2">
            <TitleIcon className="size-4" strokeWidth={1.5} />
            {titleLabel}
          </SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          {roots.length === 0 ? (
            <p className="text-sm text-ink-subtle">{emptyLabel}</p>
          ) : (
            <ul className="space-y-4">
              {roots.map((comment) => (
                <li key={comment.id}>
                  <CommentThread
                    comment={comment}
                    replies={repliesByParent.get(comment.id) ?? []}
                    currentUserId={currentUserId}
                    isPlanOwner={isPlanOwner}
                    canReply={canPost}
                    resolveAuthor={resolveAuthor}
                    onReply={postReply}
                    onDelete={removeComment}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {typists.length > 0 ? (
          <p className="px-4 text-[11px] italic text-ink-subtle">
            {typists.length === 1
              ? `${typists[0].user.displayName ?? typists[0].user.username ?? "Someone"} is typing…`
              : `${typists.length} people are typing…`}
          </p>
        ) : null}

        <div className="space-y-2 border-t border-border p-4">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={reportFocus}
            onBlur={reportBlur}
            placeholder={placeholder}
            rows={3}
            disabled={!canPost}
            className="resize-none text-sm"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={submitTopLevel}
              disabled={!canPost || draft.trim().length === 0}
            >
              {scopedItemId ? "Post comment" : "Send"}
            </Button>
          </div>
          {!canPost ? (
            <p className="text-xs text-ink-subtle">
              Viewers can read this conversation but can&apos;t post. Ask the plan owner for editor access.
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
