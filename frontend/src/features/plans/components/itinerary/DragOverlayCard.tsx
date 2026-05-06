"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type EnrichedItem, type PlanItem } from "@/lib/api";
import { ITEM_TYPE_STYLE, type ItemType } from "@/features/plans/utils/itemType";

interface Props {
  item: PlanItem;
}

export default function DragOverlayCard({ item }: Props) {
  const typeStyle = ITEM_TYPE_STYLE[item.item_type as ItemType];
  const TypeIcon = typeStyle?.Icon;
  const enriched = item.ai_data && "cross_city_pair" in item.ai_data
    ? null
    : (item.ai_data as EnrichedItem | null);
  const imageUrl = enriched?.image_url ?? null;

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-card p-3",
        "shadow-[0_8px_24px_-8px_rgba(10,10,12,0.18),0_14px_30px_-16px_rgba(10,10,12,0.22)]",
        typeStyle?.tint,
        "cursor-grabbing",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="size-[72px] shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={item.title}
              width={72}
              height={72}
              className="size-full object-cover"
              unoptimized
            />
          ) : (
            <div className="flex size-full items-center justify-center text-ink-subtle">
              <ImageOff className="size-5" strokeWidth={1.5} />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-ink">{item.title}</span>
            {typeStyle ? (
              <Badge
                variant="outline"
                className={cn("shrink-0 gap-1 text-[11px] font-medium", typeStyle.badge)}
              >
                {TypeIcon ? <TypeIcon className="size-3" strokeWidth={1.75} /> : null}
                {typeStyle.label}
              </Badge>
            ) : null}
          </div>
          {item.location ? (
            <span className="truncate text-xs text-ink-subtle">{item.location}</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
