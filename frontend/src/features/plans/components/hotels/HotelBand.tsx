"use client";

import Image from "next/image";
import {
  BedDouble,
  CalendarCheck,
  CalendarX,
  Clock,
  DollarSign,
  MapPin,
  Pencil,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type PlanHotel } from "@/lib/api";

interface Props {
  hotel: PlanHotel;
  activeDayNumber: number;
  onEdit: () => void;
  onDelete: () => void;
  isMutating: boolean;
}

export default function HotelBand({ hotel, activeDayNumber, onEdit, onDelete, isMutating }: Props) {
  const isCheckIn = activeDayNumber === hotel.check_in_day_number;
  const isCheckOut = activeDayNumber === hotel.check_out_day_number;
  const title = hotel.place_name ?? hotel.notes ?? "Stay";
  const imageUrl = hotel.place_image_url;

  return (
    <article
      className={cn(
        "flex h-full items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3",
        "shadow-[0_1px_0_rgba(10,10,12,0.04)]",
      )}
    >
      <div className="size-16 shrink-0 overflow-hidden rounded-lg border border-primary/20 bg-card">
        {imageUrl ? (
          <Image src={imageUrl} alt={title} width={64} height={64} unoptimized className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-primary/70">
            <BedDouble className="size-5" strokeWidth={1.5} />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-ink">{title}</span>
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wide text-primary">
          Stay · Days {hotel.check_in_day_number}–{hotel.check_out_day_number}
        </span>
        {hotel.place_location ? (
          <span className="inline-flex items-center gap-1 truncate text-xs text-ink-subtle">
            <MapPin className="size-3" strokeWidth={1.5} />
            <span className="truncate">{hotel.place_location}</span>
          </span>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
          {isCheckIn && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
              <CalendarCheck className="size-3" strokeWidth={1.5} />
              Check-in{hotel.check_in_time ? ` · ${hotel.check_in_time}` : ""}
            </span>
          )}
          {isCheckOut && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
              <CalendarX className="size-3" strokeWidth={1.5} />
              Check-out{hotel.check_out_time ? ` · ${hotel.check_out_time}` : ""}
            </span>
          )}
          {!isCheckIn && !isCheckOut && <span>Ongoing stay</span>}
          {hotel.place_check_in_time ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 px-2 py-0.5">
              <Clock className="size-3" strokeWidth={1.5} />
              Hotel check-in {hotel.place_check_in_time}
            </span>
          ) : null}
          {hotel.place_price_range ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 px-2 py-0.5">
              <DollarSign className="size-3" strokeWidth={1.5} />
              {hotel.place_price_range}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${title}`} disabled={isMutating}>
          <Pencil className="size-4" strokeWidth={1.5} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          disabled={isMutating}
          aria-label={`Delete ${title}`}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" strokeWidth={1.5} />
        </Button>
      </div>
    </article>
  );
}
