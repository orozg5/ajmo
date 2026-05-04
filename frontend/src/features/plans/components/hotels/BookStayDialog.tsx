"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  enrichItem,
  type DestinationResponse,
  type EnrichedItem,
  type PlanDay,
} from "@/lib/api";
import type { UseHotelsReturn } from "@/features/plans/hooks/useHotels";
import HotelNameAutocomplete from "@/features/plans/components/hotels/HotelNameAutocomplete";
import HotelPreviewCard from "@/features/plans/components/hotels/HotelPreviewCard";

const NO_DESTINATION = "__none__";

const schema = z
  .object({
    name: z.string().trim().min(1, "Hotel name is required").max(200),
    destinationId: z.string(),
    checkInDay: z.number().int().min(1),
    checkOutDay: z.number().int().min(1),
    checkInTime: z.string().optional(),
    checkOutTime: z.string().optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((value) => value.checkOutDay >= value.checkInDay, {
    path: ["checkOutDay"],
    message: "Check-out day must be on or after check-in day",
  });

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  days: PlanDay[];
  destinations: DestinationResponse[];
  hotels: UseHotelsReturn;
  editingHotelId: string | null;
}

function formatDayOption(day: PlanDay): string {
  const parts = [`Day ${day.day_number}`];
  if (day.date) parts.push(day.date);
  if (day.title) parts.push(day.title);
  return parts.join(" · ");
}

export default function BookStayDialog({
  open,
  onOpenChange,
  days,
  destinations,
  hotels,
  editingHotelId,
}: Props) {
  const editingHotel = useMemo(
    () => (editingHotelId ? hotels.hotels.find((hotel) => hotel.id === editingHotelId) : null) ?? null,
    [editingHotelId, hotels.hotels],
  );

  const firstDay = days[0]?.day_number ?? 1;

  const defaults: FormValues = useMemo(() => {
    if (editingHotel) {
      return {
        name: editingHotel.place_name ?? editingHotel.notes ?? "",
        destinationId: editingHotel.destination_id ?? NO_DESTINATION,
        checkInDay: editingHotel.check_in_day_number,
        checkOutDay: editingHotel.check_out_day_number,
        checkInTime: editingHotel.check_in_time ?? "",
        checkOutTime: editingHotel.check_out_time ?? "",
        notes: editingHotel.notes ?? "",
      };
    }
    return {
      name: "",
      destinationId: destinations[0]?.id ?? NO_DESTINATION,
      checkInDay: firstDay,
      checkOutDay: firstDay,
      checkInTime: "",
      checkOutTime: "",
      notes: "",
    };
  }, [editingHotel, destinations, firstDay]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  const watchedName = form.watch("name");
  const watchedDestinationId = form.watch("destinationId");

  const selectedDestination = useMemo(() => {
    if (watchedDestinationId === NO_DESTINATION) return null;
    return destinations.find((d) => d.id === watchedDestinationId) ?? null;
  }, [watchedDestinationId, destinations]);

  const destinationString = selectedDestination
    ? `${selectedDestination.city}, ${selectedDestination.country}`
    : "";
  const enrichmentEnabled = !editingHotel && destinationString.length > 0;

  const enrichedRef = useRef<{ placeId: string | null; name: string } | null>(null);
  const [enrichedResult, setEnrichedResult] = useState<EnrichedItem | null>(null);
  const [enrichmentError, setEnrichmentError] = useState<Error | null>(null);

  useEffect(() => {
    if (open) {
      form.reset(defaults);
      enrichedRef.current = null;
      setEnrichedResult(null);
      setEnrichmentError(null);
    }
  }, [open, defaults, form]);

  const handleEnrich = useCallback((data: EnrichedItem, itemName: string) => {
    enrichedRef.current = { placeId: data.place_id ?? null, name: itemName };
  }, []);

  const handleNameValueChange = useCallback(
    (next: string) => {
      form.setValue("name", next, { shouldValidate: true });
    },
    [form],
  );

  async function handleSubmit(values: FormValues) {
    const basePayload = {
      destination_id: values.destinationId === NO_DESTINATION ? null : values.destinationId,
      check_in_day_number: values.checkInDay,
      check_out_day_number: values.checkOutDay,
      check_in_time: values.checkInTime?.trim() ? values.checkInTime : null,
      check_out_time: values.checkOutTime?.trim() ? values.checkOutTime : null,
      notes: values.notes?.trim() ? values.notes.trim() : values.name.trim(),
    };

    try {
      if (editingHotel) {
        await hotels.updateHotel(editingHotel.id, basePayload);
      } else {
        const trimmedName = values.name.trim();
        let placeId: string | null = null;

        const reusable =
          enrichedRef.current?.placeId &&
          enrichedRef.current.name.trim() === trimmedName;
        if (reusable) {
          placeId = enrichedRef.current!.placeId;
        } else {
          const destination =
            values.destinationId === NO_DESTINATION
              ? null
              : destinations.find((d) => d.id === values.destinationId) ?? null;
          if (destination) {
            try {
              const enriched = await enrichItem(
                trimmedName,
                `${destination.city}, ${destination.country}`,
                "hotel",
              );
              placeId = enriched.place_id ?? null;
            } catch {
              // Enrichment is best-effort; fall through to create without place_id.
            }
          }
        }
        await hotels.createHotel({ ...basePayload, place_id: placeId });
      }
      onOpenChange(false);
    } catch {
      // errors bubble via react-query mutation state; UI stays open for retry
    }
  }

  const errors = form.formState.errors;
  const showGatingHelper =
    !editingHotel && destinationString === "" && destinations.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingHotel ? "Edit stay" : "Add a stay"}</DialogTitle>
          <DialogDescription>
            Add a hotel spanning one or more days. Its band will appear on every day in the range.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="hotel-name" className="text-xs font-medium text-ink">
              Hotel
            </label>
            <HotelNameAutocomplete
              value={watchedName}
              onValueChange={handleNameValueChange}
              enrichmentEnabled={enrichmentEnabled}
              destination={destinationString}
              onEnrich={handleEnrich}
              onResultChange={setEnrichedResult}
              onFetchErrorChange={setEnrichmentError}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            {showGatingHelper && (
              <p className="text-xs text-ink-subtle">
                Pick a destination below to fetch hotel details.
              </p>
            )}
            {enrichmentEnabled && enrichmentError && (
              <p className="text-xs text-destructive">{enrichmentError.message}</p>
            )}
          </div>

          {enrichmentEnabled && enrichedResult && (
            <HotelPreviewCard result={enrichedResult} name={watchedName} />
          )}

          {destinations.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink">Destination</label>
              <Controller
                control={form.control}
                name="destinationId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a destination" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_DESTINATION}>No destination</SelectItem>
                      {destinations.map((dest) => (
                        <SelectItem key={dest.id} value={dest.id}>
                          {dest.city}, {dest.country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink">Check-in day</label>
              <Controller
                control={form.control}
                name="checkInDay"
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(value) => field.onChange(Number(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Day" />
                    </SelectTrigger>
                    <SelectContent>
                      {days.map((day) => (
                        <SelectItem key={day.id} value={String(day.day_number)}>
                          {formatDayOption(day)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink">Check-out day</label>
              <Controller
                control={form.control}
                name="checkOutDay"
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(value) => field.onChange(Number(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Day" />
                    </SelectTrigger>
                    <SelectContent>
                      {days.map((day) => (
                        <SelectItem key={day.id} value={String(day.day_number)}>
                          {formatDayOption(day)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.checkOutDay && (
                <p className="text-xs text-destructive">{errors.checkOutDay.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="hotel-check-in-time" className="text-xs font-medium text-ink">
                Check-in time
              </label>
              <Input
                id="hotel-check-in-time"
                type="time"
                {...form.register("checkInTime")}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="hotel-check-out-time" className="text-xs font-medium text-ink">
                Check-out time
              </label>
              <Input
                id="hotel-check-out-time"
                type="time"
                {...form.register("checkOutTime")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="hotel-notes" className="text-xs font-medium text-ink">
              Notes
            </label>
            <Textarea
              id="hotel-notes"
              rows={2}
              placeholder="Booking reference, room type…"
              {...form.register("notes")}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting || hotels.isMutating}>
              {editingHotel ? "Save changes" : "Add stay"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
