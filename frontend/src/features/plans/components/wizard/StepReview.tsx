"use client";

import Image from "next/image";
import { useFormContext } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import {
  type DestinationRow,
  destinationsForSubmit,
} from "@/features/plans/hooks/useDestinations";
import type { WizardValues } from "@/features/plans/components/wizard/schema";

type StepReviewProps = {
  rows: DestinationRow[];
};

function formatDate(value: string | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function StepReview({ rows }: StepReviewProps) {
  const form = useFormContext<WizardValues>();
  const values = form.watch();
  const coverUrl = values.cover_image_url ?? null;
  const filledRows = destinationsForSubmit(rows);

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-display-lg">Ready to go?</h2>
        <p className="text-sm text-ink-subtle">Here&apos;s your trip. Click create when it looks right.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {coverUrl ? (
          <div className="relative aspect-[16/6] w-full">
            <Image
              src={coverUrl}
              alt="Cover"
              fill
              sizes="(max-width: 768px) 100vw, 640px"
              className="object-cover"
            />
          </div>
        ) : (
          <div className="aspect-[16/6] w-full bg-gradient-to-br from-primary/25 via-accent/25 to-secondary/25" />
        )}

        <div className="space-y-4 p-5">
          <div>
            <h3 className="text-display-lg text-[1.75rem] leading-tight">{values.title || "Untitled trip"}</h3>
            {values.description ? (
              <p className="text-sm text-ink-subtle">{values.description}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">{formatDate(values.date_from)} → {formatDate(values.date_to)}</Badge>
            {filledRows.length > 0 ? (
              filledRows.map((row) => (
                <Badge variant="secondary" key={row.id}>
                  {row.city}, {row.country}
                </Badge>
              ))
            ) : (
              <Badge variant="outline">No destinations yet</Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
