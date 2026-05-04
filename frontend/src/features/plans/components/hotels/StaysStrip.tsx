"use client";

import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { type PlanHotel } from "@/lib/api";
import HotelBand from "@/features/plans/components/hotels/HotelBand";

interface Props {
  hotels: PlanHotel[];
  activeDayNumber: number;
  isMutating: boolean;
  onAddStay: () => void;
  onEditHotel: (hotelId: string) => void;
  onDeleteHotel: (hotelId: string) => void;
}

export default function StaysStrip({
  hotels,
  activeDayNumber,
  isMutating,
  onAddStay,
  onEditHotel,
  onDeleteHotel,
}: Props) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {hotels.map((hotel) => (
        <div key={hotel.id} className="w-[320px] shrink-0">
          <HotelBand
            hotel={hotel}
            activeDayNumber={activeDayNumber}
            onEdit={() => onEditHotel(hotel.id)}
            onDelete={() => onDeleteHotel(hotel.id)}
            isMutating={isMutating}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={onAddStay}
        disabled={isMutating}
        className={cn(
          "flex w-[180px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border bg-card/40 p-4 text-sm text-ink-subtle transition-colors",
          "hover:border-primary/50 hover:bg-primary/5 hover:text-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        <Plus className="size-5" strokeWidth={1.5} />
        Add a stay
      </button>
    </div>
  );
}
