"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  type DestinationRow,
  computeAvailableDays,
  parseDayInput,
} from "@/features/plans/hooks/useDestinations";

type DestinationsEditorProps = {
  rows: DestinationRow[];
  dateFrom: string;
  dateTo: string;
  error?: string | null;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onUpdateRow: (id: string, patch: Partial<Omit<DestinationRow, "id">>) => void;
};

export default function DestinationsEditor({
  rows,
  dateFrom,
  dateTo,
  error,
  onAddRow,
  onRemoveRow,
  onUpdateRow,
}: DestinationsEditorProps) {
  const availableDays = computeAvailableDays(dateFrom, dateTo);
  const hasDates = availableDays.length > 0;

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {rows.map((row, index) => (
          <li key={row.id}>
            <DestinationRowCard
              index={index}
              row={row}
              hasDates={hasDates}
              availableDays={availableDays}
              canRemove={rows.length > 1}
              onRemove={() => onRemoveRow(row.id)}
              onUpdate={(patch) => onUpdateRow(row.id, patch)}
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-col items-start gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onAddRow}>
          <Plus className="size-4" strokeWidth={1.5} /> Add another destination
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}

type DestinationRowCardProps = {
  index: number;
  row: DestinationRow;
  hasDates: boolean;
  availableDays: { label: string; value: number }[];
  canRemove: boolean;
  onRemove: () => void;
  onUpdate: (patch: Partial<Omit<DestinationRow, "id">>) => void;
};

function DestinationRowCard({
  index,
  row,
  hasDates,
  availableDays,
  canRemove,
  onRemove,
  onUpdate,
}: DestinationRowCardProps) {
  const [dayDraft, setDayDraft] = useState<string>(row.dayNumbers.join(", "));

  function toggleDay(dayValue: number) {
    const next = row.dayNumbers.includes(dayValue)
      ? row.dayNumbers.filter((d) => d !== dayValue)
      : [...row.dayNumbers, dayValue].sort((a, b) => a - b);
    onUpdate({ dayNumbers: next });
  }

  function handleDayDraftChange(value: string) {
    setDayDraft(value);
    onUpdate({ dayNumbers: parseDayInput(value) });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
          Destination {index + 1}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={`Remove destination ${index + 1}`}
        >
          <Trash2 className="size-4" strokeWidth={1.5} />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          placeholder="Country"
          value={row.country}
          onChange={(e) => onUpdate({ country: e.target.value })}
        />
        <Input
          placeholder="City"
          value={row.city}
          onChange={(e) => onUpdate({ city: e.target.value })}
        />
      </div>

      {hasDates ? (
        <div className="space-y-1.5">
          <p className="text-xs text-ink-subtle">Assign days (optional)</p>
          <div className="flex flex-wrap gap-3">
            {availableDays.map((day) => (
              <label key={day.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <Checkbox
                  checked={row.dayNumbers.includes(day.value)}
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
          value={dayDraft}
          onChange={(e) => handleDayDraftChange(e.target.value)}
        />
      )}
    </div>
  );
}
