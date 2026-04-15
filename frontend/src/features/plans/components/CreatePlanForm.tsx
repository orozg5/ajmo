"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { createPlan, createDestination } from "@/lib/api";
import { useDestinations, computeAvailableDays } from "@/features/plans/hooks/useDestinations";

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function CreatePlanForm() {
  const router = useRouter();
  const [destinationsError, setDestinationsError] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      date_from: "",
      date_to: "",
      description: "",
    },
  });

  const dateFrom = form.watch("date_from") ?? "";
  const dateTo = form.watch("date_to") ?? "";

  const {
    destinations,
    country,
    city,
    checkedDays,
    toggleDay,
    dayInput,
    addError,
    handleFieldChange,
    addDestination,
    removeDestination,
  } = useDestinations();

  const availableDays = computeAvailableDays(dateFrom, dateTo);
  const hasDates = availableDays.length > 0;

  const mutation = useMutation({ mutationFn: createPlan });

  async function onSubmit(values: FormValues) {
    if (destinations.length === 0) {
      setDestinationsError("Add at least one destination.");
      return;
    }
    setDestinationsError("");

    const plan = await mutation.mutateAsync({
      ...values,
      date_from: values.date_from || undefined,
      date_to: values.date_to || undefined,
      description: values.description || undefined,
    });

    for (let i = 0; i < destinations.length; i++) {
      await createDestination(plan.id, {
        country: destinations[i].country,
        city: destinations[i].city,
        sort_order: i,
        day_numbers: destinations[i].dayNumbers,
      });
    }

    router.push(`/plans/${plan.id}`);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Summer in Italy" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-4">
          <FormField
            control={form.control}
            name="date_from"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>From</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="date_to"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>To</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="What's this trip about?" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Destinations section */}
        <div className="space-y-3 rounded-md border p-4">
          <p className="text-sm font-medium">Destinations *</p>

          {destinations.length > 0 && (
            <ul className="space-y-1">
              {destinations.map((dest, index) => (
                <li key={index} className="flex items-center justify-between text-sm">
                  <span>
                    {dest.city}, {dest.country}
                    {dest.dayNumbers.length > 0 && (
                      <span className="text-muted-foreground"> — Days: {dest.dayNumbers.join(", ")}</span>
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeDestination(index)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Country"
                value={country}
                onChange={(e) => handleFieldChange("country", e.target.value)}
              />
              <Input
                placeholder="City"
                value={city}
                onChange={(e) => handleFieldChange("city", e.target.value)}
              />
            </div>

            {hasDates ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Assign days (optional)</p>
                <div className="flex flex-wrap gap-3">
                  {availableDays.map((day) => (
                    <label key={day.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={checkedDays.includes(day.value)}
                        onCheckedChange={() => toggleDay(day.value)}
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <Input
                placeholder="Day numbers, e.g. 1,2,3 (optional)"
                value={dayInput}
                onChange={(e) => handleFieldChange("dayInput", e.target.value)}
              />
            )}

            {addError && <p className="text-sm text-destructive">{addError}</p>}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addDestination(dateFrom, dateTo)}
            >
              Add destination
            </Button>
          </div>
        </div>

        {destinationsError && <p className="text-sm text-destructive">{destinationsError}</p>}
        {mutation.isError && <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>}

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Creating…" : "Create Plan"}
        </Button>
      </form>
    </Form>
  );
}
