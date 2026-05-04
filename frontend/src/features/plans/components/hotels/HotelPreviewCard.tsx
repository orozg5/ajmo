"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { type EnrichedItem } from "@/lib/api";
import { FIELD_LABELS } from "@/features/plans/utils/fieldLabels";

// Intentionally configurable — which enriched fields to surface in the Book Stay preview card.
// Order drives render order. Keys must match the EnrichedItem interface.
const HOTEL_PREVIEW_FIELDS: ReadonlyArray<keyof EnrichedItem> = [
  "description",
  "location",
  "amenities",
  "check_in_time",
  "price_range",
  "booking_tips",
];

interface HotelPreviewCardProps {
  result: EnrichedItem;
  name: string;
}

export default function HotelPreviewCard({ result, name }: HotelPreviewCardProps) {
  return (
    <Card>
      <CardContent className="space-y-3 p-3 text-sm">
        <div className="h-28 w-full overflow-hidden rounded-lg border border-border bg-muted">
          {result.image_url ? (
            <Image
              src={result.image_url}
              alt={name}
              width={640}
              height={224}
              className="size-full object-cover"
              unoptimized
            />
          ) : (
            <div className="flex size-full items-center justify-center text-ink-subtle">
              <ImageOff className="size-7" strokeWidth={1.5} />
            </div>
          )}
        </div>

        {HOTEL_PREVIEW_FIELDS.map((field) => {
          const value = result[field];
          if (value == null) return null;
          if (Array.isArray(value) && value.length === 0) return null;
          const label = FIELD_LABELS[field];
          if (!label) return null;

          if (Array.isArray(value)) {
            return (
              <div key={field}>
                <p className="font-medium mb-1">{label}:</p>
                <ul className="list-disc list-inside space-y-1">
                  {value.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            );
          }

          return (
            <p key={field}>
              <span className="font-medium">{label}:</span> {value}
            </p>
          );
        })}
      </CardContent>
    </Card>
  );
}
