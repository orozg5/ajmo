"use client";

import { type DestinationResponse } from "@/lib/api";
import DestinationsEditor from "@/features/plans/components/destinations/DestinationsEditor";
import {
  type DestinationRow,
  destinationsForSubmit,
  isUnsavedId,
} from "@/features/plans/hooks/useDestinations";

export function destinationsToRows(destinations: DestinationResponse[]): DestinationRow[] {
  return destinations
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((dest) => ({
      id: dest.id,
      country: dest.country,
      city: dest.city,
      dayNumbers: [...dest.days].sort((a, b) => a - b),
    }));
}

function sameDayNumbers(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((value, index) => value === sortedB[index]);
}

export type DestinationsDiff = {
  toDelete: DestinationResponse[];
  toCreate: { row: DestinationRow; sortOrder: number }[];
  toUpdate: { row: DestinationRow; sortOrder: number; original: DestinationResponse }[];
};

export function buildDiff(
  original: DestinationResponse[],
  current: DestinationRow[],
): DestinationsDiff {
  const originalById = new Map(original.map((dest) => [dest.id, dest]));
  const filledCurrent = destinationsForSubmit(current);
  const currentSavedIds = new Set(
    filledCurrent.filter((row) => !isUnsavedId(row.id)).map((row) => row.id),
  );

  const toDelete = original.filter((dest) => !currentSavedIds.has(dest.id));
  const toCreate: DestinationsDiff["toCreate"] = [];
  const toUpdate: DestinationsDiff["toUpdate"] = [];

  filledCurrent.forEach((row, index) => {
    if (isUnsavedId(row.id)) {
      toCreate.push({ row, sortOrder: index });
      return;
    }
    const orig = originalById.get(row.id);
    if (!orig) return;
    const changed =
      orig.country !== row.country.trim() ||
      orig.city !== row.city.trim() ||
      orig.sort_order !== index ||
      !sameDayNumbers(orig.days, row.dayNumbers);
    if (changed) {
      toUpdate.push({ row, sortOrder: index, original: orig });
    }
  });

  return { toDelete, toCreate, toUpdate };
}

type EditPlanDestinationsTabProps = {
  rows: DestinationRow[];
  dateFrom: string;
  dateTo: string;
  error: string | null;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onUpdateRow: (id: string, patch: Partial<Omit<DestinationRow, "id">>) => void;
};

export default function EditPlanDestinationsTab({
  rows,
  dateFrom,
  dateTo,
  error,
  onAddRow,
  onRemoveRow,
  onUpdateRow,
}: EditPlanDestinationsTabProps) {
  return (
    <DestinationsEditor
      rows={rows}
      dateFrom={dateFrom}
      dateTo={dateTo}
      error={error}
      onAddRow={onAddRow}
      onRemoveRow={onRemoveRow}
      onUpdateRow={onUpdateRow}
    />
  );
}
