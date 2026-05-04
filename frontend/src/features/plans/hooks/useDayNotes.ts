"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseDayNotesOptions {
  dayId: string;
  initial: string | null;
  onPersist: (dayId: string, notes: string | null) => Promise<unknown>;
  debounceMs?: number;
}

export interface UseDayNotesReturn {
  value: string;
  isSaving: boolean;
  handleChange: (next: string) => void;
}

const DEFAULT_DEBOUNCE_MS = 800;

export function useDayNotes({
  dayId,
  initial,
  onPersist,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseDayNotesOptions): UseDayNotesReturn {
  const [value, setValue] = useState<string>(initial ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedRef = useRef<string>(initial ?? "");

  useEffect(() => {
    setValue(initial ?? "");
    lastPersistedRef.current = initial ?? "";
  }, [dayId, initial]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleChange = useCallback(
    (next: string) => {
      setValue(next);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        if (next === lastPersistedRef.current) return;
        setIsSaving(true);
        try {
          await onPersist(dayId, next.trim().length === 0 ? null : next);
          lastPersistedRef.current = next;
        } finally {
          setIsSaving(false);
        }
      }, debounceMs);
    },
    [dayId, onPersist, debounceMs],
  );

  return { value, isSaving, handleChange };
}
