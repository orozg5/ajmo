"use client";

import { useFormContext } from "react-hook-form";

import DestinationsEditor from "@/features/plans/components/destinations/DestinationsEditor";
import type { UseDestinationsReturn } from "@/features/plans/hooks/useDestinations";
import type { WizardValues } from "@/features/plans/components/wizard/schema";

type StepDestinationsProps = {
  destinationsController: UseDestinationsReturn;
  error?: string | null;
};

export default function StepDestinations({
  destinationsController,
  error,
}: StepDestinationsProps) {
  const form = useFormContext<WizardValues>();
  const dateFrom = form.watch("date_from") ?? "";
  const dateTo = form.watch("date_to") ?? "";

  const { rows, addRow, removeRow, updateRow } = destinationsController;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-display-lg">Pick your destinations</h2>
        <p className="text-sm text-ink-subtle">
          Add every city you&apos;d like to visit. You can assign days now or leave them empty and fill in later.
        </p>
      </div>

      <DestinationsEditor
        rows={rows}
        dateFrom={dateFrom}
        dateTo={dateTo}
        error={error}
        onAddRow={addRow}
        onRemoveRow={removeRow}
        onUpdateRow={updateRow}
      />
    </div>
  );
}
