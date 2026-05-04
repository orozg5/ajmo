"use client";

import { useFormContext } from "react-hook-form";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  type UseDestinationsReturn,
  computeAvailableDays,
} from "@/features/plans/hooks/useDestinations";
import type { WizardValues } from "@/features/plans/components/wizard/schema";

type StepDestinationsProps = {
  destinationsController: UseDestinationsReturn;
};

export default function StepDestinations({ destinationsController }: StepDestinationsProps) {
  const form = useFormContext<WizardValues>();
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
  } = destinationsController;

  const availableDays = computeAvailableDays(dateFrom, dateTo);
  const hasDates = availableDays.length > 0;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-display-lg">Pick your destinations</h2>
        <p className="text-sm text-ink-subtle">Add every city you&apos;d like to visit. You can assign days to each one.</p>
      </div>

      {destinations.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {destinations.map((dest, index) => (
            <li key={`${dest.city}-${dest.country}-${index}`}>
              <Badge variant="secondary" className="gap-1.5 pr-1">
                <span>
                  {dest.city}, {dest.country}
                  {dest.dayNumbers.length > 0 && (
                    <span className="ml-1 opacity-80">· days {dest.dayNumbers.join(", ")}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => removeDestination(index)}
                  className="rounded-full p-0.5 hover:bg-background/40"
                  aria-label={`Remove ${dest.city}`}
                >
                  <X className="size-3" strokeWidth={1.5} />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <div className="space-y-1.5">
            <p className="text-xs text-ink-subtle">Assign days (optional)</p>
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
  );
}
