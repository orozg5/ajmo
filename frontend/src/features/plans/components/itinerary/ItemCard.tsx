"use client";

import Image from "next/image";
import { useState } from "react";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  GripVertical,
  ImageOff,
  MapPin,
  MapPinOff,
  Timer,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type EnrichedItem, type PlanItem } from "@/lib/api";
import TransportCard from "@/features/plans/components/transport/TransportCard";
import { useEditingReporter } from "@/features/plans/hooks/useEditingReporter";
import { useItemNotes } from "@/features/plans/hooks/useItemNotes";
import { usePlanCollab } from "@/features/plans/hooks/PlanCollabContext";
import { ITEM_TYPE_STYLE, type ItemType } from "@/features/plans/utils/itemType";
import EditingPresence from "@/features/plans/components/awareness/EditingPresence";
import ItemComments from "@/features/plans/components/itinerary/ItemComments";
import ItemLike from "@/features/plans/components/itinerary/ItemLike";
import ItemRating from "@/features/plans/components/itinerary/ItemRating";

interface Props {
  item: PlanItem;
  onRemove: () => void;
  onNotesUpdate: (notes: string | null) => void;
  isHighlighted?: boolean;
  onHoverChange?: (itemId: string, hovered: boolean) => void;
}

export default function ItemCard(props: Props) {
  if (props.item.item_type === "transport") {
    return (
      <TransportCard
        item={props.item}
        onRemove={props.onRemove}
        isHighlighted={props.isHighlighted}
        onHoverChange={props.onHoverChange}
      />
    );
  }
  return <NonTransportItemCard {...props} />;
}

function NonTransportItemCard({ item, onRemove, onNotesUpdate, isHighlighted = false, onHoverChange }: Props) {
  const { role } = usePlanCollab();
  const isViewer = role === "viewer";
  const typeStyle = ITEM_TYPE_STYLE[item.item_type as ItemType];
  const TypeIcon = typeStyle?.Icon;
  const { reportFocus: reportNotesFocus, reportBlur: reportNotesBlur } =
    useEditingReporter("item_notes", item.id);

  const [isExpanded, setIsExpanded] = useState(false);
  const { value: notes, handleChange: handleNotesChange } = useItemNotes({
    itemId: item.id,
    initial: item.notes,
    onPersist: onNotesUpdate,
  });

  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver, active } = useSortable({
    id: item.id,
  });

  const enriched = item.ai_data && "cross_city_pair" in item.ai_data ? null : (item.ai_data as EnrichedItem | null);
  const description = enriched?.description;
  const openingHours = enriched?.opening_hours ?? enriched?.check_in_time ?? enriched?.schedule;
  const priceRange = enriched?.price_range;
  const location = item.location ?? enriched?.location ?? null;
  const imageUrl = enriched?.image_url ?? null;
  const duration = enriched?.duration;
  const hasCoordinates = enriched?.lat != null && enriched?.lng != null;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  } as const;

  const showDropIndicator = isOver && active && active.id !== item.id;

  return (
    <>
      {showDropIndicator ? (
        <div aria-hidden className="-mb-1 h-1 rounded-full bg-secondary/80" />
      ) : null}
    <article
      ref={setNodeRef}
      style={style}
      data-item-id={item.id}
      onMouseEnter={() => onHoverChange?.(item.id, true)}
      onMouseLeave={() => onHoverChange?.(item.id, false)}
      onFocus={() => onHoverChange?.(item.id, true)}
      onBlur={() => onHoverChange?.(item.id, false)}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-card p-3",
        "shadow-[0_1px_0_rgba(10,10,12,0.04),0_8px_24px_-12px_rgba(10,10,12,0.08)]",
        "hover:shadow-[0_1px_0_rgba(10,10,12,0.06),0_14px_30px_-12px_rgba(10,10,12,0.12)]",
        typeStyle?.tint,
        isHighlighted && "ring-2 ring-secondary/70",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label={`Drag ${item.title}`}
          className="mt-1 flex size-9 shrink-0 cursor-grab items-center justify-center rounded-md bg-muted/50 text-ink-subtle hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-5" strokeWidth={1.5} />
        </button>

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

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
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

            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsExpanded((value) => !value)}
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? (
                  <ChevronUp className="size-5" strokeWidth={1.5} />
                ) : (
                  <ChevronDown className="size-5" strokeWidth={1.5} />
                )}
              </Button>
              {!isViewer ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onRemove}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Remove ${item.title}`}
                >
                  <Trash2 className="size-5" strokeWidth={1.5} />
                </Button>
              ) : null}
            </div>
          </div>

          {(location || item.start_time || duration || priceRange) && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
              {location ? (
                hasCoordinates ? (
                  <span className="inline-flex max-w-[14rem] items-center gap-1.5 truncate">
                    <MapPin className="size-3.5" strokeWidth={1.5} />
                    <span className="truncate">{location}</span>
                  </span>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex max-w-[14rem] items-center gap-1.5 truncate text-amber-700 dark:text-amber-400">
                        <MapPinOff className="size-3.5" strokeWidth={1.5} />
                        <span className="truncate">{location}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">No coordinates — not shown on map</TooltipContent>
                  </Tooltip>
                )
              ) : null}
              {item.start_time ? (
                <Badge variant="outline" className="gap-1">
                  <Clock className="size-3" strokeWidth={1.5} />
                  {item.start_time}
                </Badge>
              ) : null}
              {duration ? (
                <Badge variant="outline" className="gap-1">
                  <Timer className="size-3" strokeWidth={1.5} />
                  {duration}
                </Badge>
              ) : null}
              {priceRange ? (
                <Badge variant="outline" className="gap-1">
                  <DollarSign className="size-3" strokeWidth={1.5} />
                  {priceRange}
                </Badge>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
          {description && <p className="text-ink-subtle">{description}</p>}
          {openingHours ? (
            <Badge variant="outline" className="gap-1.5">
              <Clock className="size-3.5" strokeWidth={1.5} />
              {openingHours}
            </Badge>
          ) : null}

          {enriched?.cuisine ? (
            <p>
              <span className="font-medium">Cuisine:</span> <span className="text-ink-subtle">{enriched.cuisine}</span>
            </p>
          ) : null}

          {enriched?.reservation_tips ? (
            <p>
              <span className="font-medium">Reservation tips:</span>{" "}
              <span className="text-ink-subtle">{enriched.reservation_tips}</span>
            </p>
          ) : null}

          {enriched?.booking_tips ? (
            <p>
              <span className="font-medium">Booking tips:</span>{" "}
              <span className="text-ink-subtle">{enriched.booking_tips}</span>
            </p>
          ) : null}

          {enriched?.tips && enriched.tips.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Tips</p>
              <div className="flex flex-wrap gap-1.5">
                {enriched.tips.map((tip, idx) => (
                  <Badge key={idx} variant="outline" className="font-normal">
                    {tip}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {enriched?.amenities && enriched.amenities.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Amenities</p>
              <div className="flex flex-wrap gap-1.5">
                {enriched.amenities.map((amenity, idx) => (
                  <Badge key={idx} variant="outline" className="font-normal">
                    {amenity}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {enriched?.categories && enriched.categories.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Categories</p>
              <div className="flex flex-wrap gap-1.5">
                {enriched.categories.map((category, idx) => (
                  <Badge key={idx} variant="secondary" className="font-normal">
                    {category}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Notes</p>
              <EditingPresence kind="item_notes" id={item.id} />
            </div>
            <Textarea
              value={notes}
              onChange={(event) => handleNotesChange(event.target.value)}
              onFocus={reportNotesFocus}
              onBlur={reportNotesBlur}
              placeholder="Add your notes here…"
              rows={3}
              disabled={isViewer}
              className="resize-none text-sm"
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
        <div className="flex items-center gap-1.5">
          <ItemLike planItemId={item.id} />
          <ItemComments planItemId={item.id} itemTitle={item.title} />
        </div>
        <ItemRating planItemId={item.id} />
      </div>
    </article>
    </>
  );
}
