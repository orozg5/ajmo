"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, MapPin, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { type Plan } from "@/lib/api";
import { cn } from "@/lib/utils";
import DeletePlanDialog from "@/features/plans/components/itinerary/DeletePlanDialog";
import TripStatusPill from "@/features/plans/components/dashboard/TripStatusPill";
import { formatDateRange } from "@/features/plans/utils/formatDateRange";
import { getTripStatus } from "@/features/plans/utils/tripStatus";
import { VISIBILITY_ICON, VISIBILITY_LABEL } from "@/features/plans/utils/visibility";

type PlanCardProps = {
  plan: Plan;
  className?: string;
  showDelete?: boolean;
};

export default function PlanCard({ plan, className, showDelete = false }: PlanCardProps) {
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const VisibilityIcon = VISIBILITY_ICON[plan.visibility];
  const visibilityLabel = VISIBILITY_LABEL[plan.visibility];
  const dateRange = formatDateRange(plan.date_from, plan.date_to);
  const status = getTripStatus(plan);
  const destinations = plan.destinations ?? [];

  return (
    <div className={cn("relative h-full", className)}>
      <Link
        href={`/plans/${plan.id}`}
        className={cn(
          "group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card",
          "shadow-[0_1px_0_rgba(10,10,12,0.04),0_8px_24px_-18px_rgba(10,10,12,0.16)]",
          "transition-shadow hover:shadow-[0_1px_0_rgba(10,10,12,0.06),0_22px_44px_-22px_rgba(10,10,12,0.22)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        )}
      >
        <div className="relative aspect-[16/9] w-full">
          {plan.cover_image_url ? (
            <Image
              src={plan.cover_image_url}
              alt={`${plan.title} cover`}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            />
          ) : (
            <div className="size-full bg-gradient-to-br from-primary/35 via-accent/25 to-secondary/35" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
          <Badge
            variant="outline"
            className="absolute right-3 top-3 gap-1 bg-background/90 backdrop-blur"
          >
            <VisibilityIcon className="size-3.5" strokeWidth={1.5} />
            {visibilityLabel}
          </Badge>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-display-lg text-xl leading-tight line-clamp-2">{plan.title}</h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <TripStatusPill status={status} />
            {dateRange ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-subtle">
                <Calendar className="size-3.5" strokeWidth={1.5} />
                {dateRange}
              </span>
            ) : null}
          </div>

          {destinations.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {destinations.slice(0, 3).map((dest) => (
                <Badge variant="secondary" key={dest.id} className="gap-1">
                  <MapPin className="size-3" strokeWidth={1.5} />
                  {dest.city}
                </Badge>
              ))}
              {destinations.length > 3 ? (
                <Badge variant="outline" className="bg-background">
                  +{destinations.length - 3}
                </Badge>
              ) : null}
            </div>
          ) : null}

          {plan.description ? (
            <p className="line-clamp-2 text-sm text-ink-subtle">{plan.description}</p>
          ) : null}
        </div>
      </Link>
      {showDelete ? (
        <>
          <button
            type="button"
            onClick={() => setDeleteDialogOpen(true)}
            aria-label={`Delete ${plan.title}`}
            className={cn(
              "absolute left-3 top-3 z-10 inline-flex size-7 items-center justify-center",
              "rounded-full border border-border bg-background/80 text-ink-subtle backdrop-blur",
              "transition-colors hover:bg-destructive hover:text-destructive-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60",
            )}
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
          <DeletePlanDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            planId={plan.id}
            planTitle={plan.title}
            onDeleted={() => {
              queryClient.invalidateQueries({ queryKey: ["plans"] });
              toast.success("Trip deleted");
            }}
          />
        </>
      ) : null}
    </div>
  );
}
