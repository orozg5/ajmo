"use client";

import Link from "next/link";
import { ArrowRight, FilterX } from "lucide-react";

import { Button } from "@/components/ui/button";
import CompassMark from "@/components/brand/CompassMark";
import { cn } from "@/lib/utils";

type EmptyPlansStateBaseProps = {
  className?: string;
};

type EmptyPlansStateEmptyProps = EmptyPlansStateBaseProps & {
  variant?: "empty";
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
  showCta?: boolean;
};

type EmptyPlansStateFilteredProps = EmptyPlansStateBaseProps & {
  variant: "filtered";
  onClearFilters: () => void;
  title?: string;
  description?: string;
};

type EmptyPlansStateProps = EmptyPlansStateEmptyProps | EmptyPlansStateFilteredProps;

export default function EmptyPlansState(props: EmptyPlansStateProps) {
  if (props.variant === "filtered") {
    const {
      className,
      onClearFilters,
      title = "No trips match these filters.",
      description = "Try clearing a filter or two, or start a fresh plan.",
    } = props;
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center",
          className,
        )}
      >
        <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-ink-subtle">
          <FilterX className="size-8" strokeWidth={1.5} />
        </div>
        <div className="space-y-1">
          <h3 className="text-display-lg text-xl">{title}</h3>
          <p className="mx-auto max-w-sm text-sm text-ink-subtle">{description}</p>
        </div>
        <Button variant="secondary" onClick={onClearFilters}>
          Clear filters
        </Button>
      </div>
    );
  }

  const {
    className,
    title = "No trips yet. Let's go somewhere.",
    description = "Start with a name, pick a few dates, and we'll help you fill in the rest.",
    ctaLabel = "New plan",
    ctaHref = "/plans/new",
    showCta = true,
  } = props;
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center",
        className,
      )}
    >
      <CompassMark className="size-24 text-primary" />
      <div className="space-y-1">
        <h3 className="text-display-lg text-xl">{title}</h3>
        <p className="mx-auto max-w-sm text-sm text-ink-subtle">{description}</p>
      </div>
      {showCta ? (
        <Button asChild>
          <Link href={ctaHref}>
            {ctaLabel}
            <ArrowRight className="size-4" strokeWidth={1.5} />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
