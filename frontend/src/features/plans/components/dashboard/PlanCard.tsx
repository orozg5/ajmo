"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Calendar, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { type Plan } from "@/lib/api";
import { cn } from "@/lib/utils";
import { VISIBILITY_ICON, VISIBILITY_LABEL } from "@/features/plans/utils/visibility";

function formatRange(from: string | null, to: string | null): string | null {
  if (!from && !to) return null;
  const start = from ? new Date(from) : null;
  const end = to ? new Date(to) : null;
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (start && end) {
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    const startLabel = start.toLocaleDateString("en-US", options);
    const endLabel = end.toLocaleDateString("en-US", { ...options, year: sameYear ? undefined : "numeric" });
    return sameYear ? `${startLabel} → ${endLabel}` : `${startLabel} ${start.getUTCFullYear()} → ${endLabel}`;
  }
  const only = start ?? end;
  return only ? only.toLocaleDateString("en-US", { ...options, year: "numeric" }) : null;
}

type PlanCardProps = {
  plan: Plan;
  className?: string;
};

export default function PlanCard({ plan, className }: PlanCardProps) {
  const reducedMotion = useReducedMotion();
  const VisibilityIcon = VISIBILITY_ICON[plan.visibility];
  const visibilityLabel = VISIBILITY_LABEL[plan.visibility];
  const dateRange = formatRange(plan.date_from, plan.date_to);
  const destinations = plan.destinations ?? [];

  return (
    <motion.div
      whileHover={reducedMotion ? undefined : { y: -3 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn("h-full", className)}
    >
      <Link
        href={`/plans/${plan.id}`}
        className={cn(
          "group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card",
          "shadow-[0_1px_0_rgba(10,10,12,0.04),0_12px_28px_-16px_rgba(10,10,12,0.14)]",
          "hover:shadow-[0_1px_0_rgba(10,10,12,0.06),0_20px_36px_-16px_rgba(10,10,12,0.2)]",
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
              className="object-cover"
            />
          ) : (
            <div className="size-full bg-gradient-to-br from-primary/35 via-accent/25 to-secondary/35" />
          )}
          <Badge
            variant="outline"
            className="absolute right-3 top-3 gap-1 bg-background/90 backdrop-blur"
          >
            <VisibilityIcon className="size-3.5" strokeWidth={1.5} />
            {visibilityLabel}
          </Badge>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <h3 className="text-display-lg text-xl leading-tight line-clamp-2">{plan.title}</h3>

          {dateRange ? (
            <div className="flex items-center gap-1.5 text-xs text-ink-subtle">
              <Calendar className="size-3.5" strokeWidth={1.5} />
              {dateRange}
            </div>
          ) : null}

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
    </motion.div>
  );
}
