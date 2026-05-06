import { useState } from "react";

export interface DestinationRow {
  id: string;
  country: string;
  city: string;
  dayNumbers: number[];
}

export interface DayOption {
  label: string;
  value: number;
}

export function computeAvailableDays(dateFrom: string, dateTo: string): DayOption[] {
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return [];

  const days: DayOption[] = [];
  const current = new Date(start);
  let dayNumber = 1;

  while (current <= end) {
    const label = `Day ${dayNumber} (${current.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })})`;
    days.push({ label, value: dayNumber });
    current.setDate(current.getDate() + 1);
    dayNumber++;
  }

  return days;
}

export function parseDayInput(input: string): number[] {
  return input
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
}

const UNSAVED_PREFIX = "new-";

function makeUnsavedId(): string {
  return `${UNSAVED_PREFIX}${crypto.randomUUID()}`;
}

export function isUnsavedId(id: string): boolean {
  return id.startsWith(UNSAVED_PREFIX);
}

function emptyRow(): DestinationRow {
  return { id: makeUnsavedId(), country: "", city: "", dayNumbers: [] };
}

export function destinationsForSubmit(rows: DestinationRow[]): DestinationRow[] {
  return rows.filter((row) => row.country.trim() !== "" || row.city.trim() !== "");
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export function validateRowsForSubmit(rows: DestinationRow[]): ValidationResult {
  const filled = destinationsForSubmit(rows);
  if (filled.length === 0) {
    return { ok: false, error: "Add at least one destination." };
  }
  const incomplete = filled.find(
    (row) => row.country.trim() === "" || row.city.trim() === "",
  );
  if (incomplete) {
    return { ok: false, error: "Each destination needs a country and a city." };
  }
  return { ok: true };
}

export interface UseDestinationsReturn {
  rows: DestinationRow[];
  addRow: () => void;
  removeRow: (id: string) => void;
  updateRow: (id: string, patch: Partial<Omit<DestinationRow, "id">>) => void;
  resetRows: (rows: DestinationRow[]) => void;
}

export function useDestinations(initialRows?: DestinationRow[]): UseDestinationsReturn {
  const [rows, setRows] = useState<DestinationRow[]>(
    initialRows && initialRows.length > 0 ? initialRows : [emptyRow()],
  );

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(id: string) {
    setRows((prev) => {
      const next = prev.filter((row) => row.id !== id);
      return next.length === 0 ? [emptyRow()] : next;
    });
  }

  function updateRow(id: string, patch: Partial<Omit<DestinationRow, "id">>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function resetRows(nextRows: DestinationRow[]) {
    setRows(nextRows.length > 0 ? nextRows : [emptyRow()]);
  }

  return { rows, addRow, removeRow, updateRow, resetRows };
}
