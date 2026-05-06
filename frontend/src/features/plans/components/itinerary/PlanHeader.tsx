"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  Calendar,
  MapPin,
  Settings as SettingsIcon,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import type * as Y from "yjs";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type DestinationResponse, type Plan, type PlanRole, updatePlan } from "@/lib/api";
import { setPlanMeta } from "@/lib/yjs/mutations";
import { type PlanMetaPatch } from "@/lib/yjs/schema";
import EditPlanDialog from "@/features/plans/components/itinerary/EditPlanDialog";
import ShareDialog from "@/features/social/components/ShareDialog";
import { VISIBILITY_ICON, VISIBILITY_LABEL } from "@/features/plans/utils/visibility";

type PlanHeaderProps = {
  plan: Plan;
  destinations: DestinationResponse[];
  isOwner: boolean;
  role: PlanRole;
  doc: Y.Doc | null;
  liveMeta: PlanMetaPatch;
};

function formatDateRange(from: string | null, to: string | null): string | null {
  if (!from && !to) return null;
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const yearOptions: Intl.DateTimeFormatOptions = { ...options, year: "numeric" };
  const start = from ? new Date(from) : null;
  const end = to ? new Date(to) : null;
  if (start && end) {
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    const startLabel = start.toLocaleDateString("en-US", sameYear ? options : yearOptions);
    const endLabel = end.toLocaleDateString("en-US", yearOptions);
    return `${startLabel} → ${endLabel}`;
  }
  const only = start ?? end;
  return only ? only.toLocaleDateString("en-US", yearOptions) : null;
}

export default function PlanHeader({ plan, destinations, isOwner, role, doc, liveMeta }: PlanHeaderProps) {
  const reducedMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(plan.title);
  const [localTitle, setLocalTitle] = useState(plan.title);
  const [editPlanOpen, setEditPlanOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const canEdit = role === "owner" || role === "editor";

  useEffect(() => {
    setLocalTitle(plan.title);
    setDraftTitle(plan.title);
  }, [plan.title]);

  // When a peer broadcasts a title change, mirror it locally. The saving
  // client also writes to liveMeta, but since localTitle was already updated
  // optimistically there, this useEffect is a no-op for them. Yjs is the
  // external system here, so syncing into local state is the intended use.
  useEffect(() => {
    if (typeof liveMeta.title === "string" && liveMeta.title !== localTitle) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalTitle(liveMeta.title);
      setDraftTitle(liveMeta.title);
    }
  }, [liveMeta.title, localTitle]);

  const titleMutation = useMutation({
    mutationFn: (title: string) => updatePlan(plan.id, { title }),
    onSuccess: (next) => {
      setLocalTitle(next.title);
      if (doc) setPlanMeta(doc, { title: next.title });
    },
  });

  async function commitTitle() {
    const trimmed = draftTitle.trim();
    if (!trimmed || trimmed === localTitle) {
      setDraftTitle(localTitle);
      setIsEditing(false);
      return;
    }
    try {
      await titleMutation.mutateAsync(trimmed);
      setIsEditing(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't rename trip";
      toast.error(message);
    }
  }

  function cancelTitle() {
    setDraftTitle(localTitle);
    setIsEditing(false);
  }

  function startEdit() {
    if (!canEdit) return;
    setIsEditing(true);
    setDraftTitle(localTitle);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  const displayDateFrom =
    liveMeta.date_from !== undefined ? liveMeta.date_from : plan.date_from;
  const displayDateTo =
    liveMeta.date_to !== undefined ? liveMeta.date_to : plan.date_to;
  const displayCoverUrl =
    liveMeta.cover_image_url !== undefined ? liveMeta.cover_image_url : plan.cover_image_url;
  const displayDescription =
    liveMeta.description !== undefined ? liveMeta.description : plan.description;
  const displayVisibility =
    typeof liveMeta.visibility === "string"
      ? (liveMeta.visibility as Plan["visibility"])
      : plan.visibility;

  const dateRange = formatDateRange(displayDateFrom ?? null, displayDateTo ?? null);
  const VisibilityIcon = VISIBILITY_ICON[displayVisibility];
  const visibilityLabel = VISIBILITY_LABEL[displayVisibility];

  function handleShare() {
    setShareDialogOpen(true);
  }

  function handleSettings() {
    setEditPlanOpen(true);
  }

  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <div className="relative aspect-[16/5] w-full">
        {displayCoverUrl ? (
          <Image
            src={displayCoverUrl}
            alt={`${localTitle} cover`}
            fill
            sizes="(max-width: 768px) 100vw, 1024px"
            className="object-cover"
            priority
          />
        ) : (
          <div className="size-full bg-gradient-to-br from-primary/40 via-accent/30 to-secondary/40" />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card to-transparent" />
      </div>

      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            {isEditing ? (
              <input
                ref={inputRef}
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={commitTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitTitle();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    cancelTitle();
                  }
                }}
                className={cn(
                  "w-full border-b border-primary/50 bg-transparent pb-1 text-display-xl outline-none",
                  "focus-visible:border-primary",
                )}
                autoFocus
                aria-label="Trip title"
              />
            ) : (
              <h1
                className={cn(
                  "text-display-xl leading-tight",
                  canEdit && "cursor-text hover:text-primary/90",
                )}
                onClick={startEdit}
                title={canEdit ? "Click to rename" : undefined}
              >
                {localTitle}
              </h1>
            )}
            {displayDescription ? (
              <p className="max-w-2xl text-sm text-ink-subtle">{displayDescription}</p>
            ) : null}
            {role !== "owner" ? (
              <Badge variant={role === "viewer" ? "outline" : "secondary"} className="capitalize">
                {role}
              </Badge>
            ) : null}
          </div>

          <div className="flex -space-x-2">
            <Avatar className="size-9 border-2 border-card">
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {isOwner ? "You" : "OW"}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-subtle">
          {dateRange ? (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5" strokeWidth={1.5} />
              {dateRange}
            </span>
          ) : null}
          {dateRange ? <span aria-hidden className="opacity-40">·</span> : null}
          <span className="inline-flex items-center gap-1.5">
            <VisibilityIcon className="size-3.5" strokeWidth={1.5} />
            {visibilityLabel}
          </span>
          <span aria-hidden className="opacity-40">·</span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5" strokeWidth={1.5} />
            {destinations.length > 0
              ? destinations.map((dest) => `${dest.city}, ${dest.country}`).join(" · ")
              : "No destinations yet"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleShare}>
            <Share2 className="size-4" strokeWidth={1.5} />
            Share
          </Button>
          {canEdit ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={handleSettings}>
                  <SettingsIcon className="size-4" strokeWidth={1.5} />
                  Settings
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {role === "owner"
                  ? "Edit trip, destinations, and danger zone"
                  : "Edit trip and destinations"}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>

      {canEdit ? (
        <EditPlanDialog
          open={editPlanOpen}
          onOpenChange={setEditPlanOpen}
          plan={{
            ...plan,
            title: localTitle,
            description: displayDescription ?? null,
            date_from: displayDateFrom ?? null,
            date_to: displayDateTo ?? null,
            visibility: displayVisibility,
            cover_image_url: displayCoverUrl ?? null,
            cover_image_path:
              liveMeta.cover_image_path !== undefined
                ? liveMeta.cover_image_path
                : plan.cover_image_path,
          }}
          destinations={destinations}
          role={role}
          doc={doc}
        />
      ) : null}

      <ShareDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        planId={plan.id}
        isOwner={isOwner}
      />
    </motion.section>
  );
}
