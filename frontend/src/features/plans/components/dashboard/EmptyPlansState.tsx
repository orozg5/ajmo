"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import CompassMark from "@/components/brand/CompassMark";
import { cn } from "@/lib/utils";

type EmptyPlansStateProps = {
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
  showCta?: boolean;
  className?: string;
};

export default function EmptyPlansState({
  title = "No trips yet — let's go somewhere.",
  description = "Start with a name, pick a few dates, and we'll help you fill in the rest.",
  ctaLabel = "New plan",
  ctaHref = "/plans/new",
  showCta = true,
  className,
}: EmptyPlansStateProps) {
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
