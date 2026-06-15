"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseDayNotesOptions {
  dayId: string;
  initial: string | null;
  onPersist: (dayId: string, notes: string | null) => Promise<unknown>;
}

export interface UseDayNotesReturn {
  value: string;
  isSaving: boolean;
  handleChange: (next: string) => void;
}

interface LastSeen {
  dayId: string;
  value: string;
}

export function useDayNotes({
  dayId,
  initial,
  onPersist,
}: UseDayNotesOptions): UseDayNotesReturn {
  const [value, setValue] = useState<string>(initial ?? "");
  const [isSaving] = useState(false);
  // Tracks the last value we either wrote or accepted, so the effect below can ignore echoes of our own keystrokes — otherwise certain delete sequences let `initial` snap the field back to the previous text before the local write resolves.
  const lastSeenRef = useRef<LastSeen>({ dayId, value: initial ?? "" });

  useEffect(() => {
    const incoming = initial ?? "";
    if (lastSeenRef.current.dayId !== dayId) {
      lastSeenRef.current = { dayId, value: incoming };
      setValue(incoming);
      return;
    }
    if (lastSeenRef.current.value !== incoming) {
      lastSeenRef.current = { dayId, value: incoming };
      setValue(incoming);
    }
  }, [dayId, initial]);

  const handleChange = useCallback(
    (next: string) => {
      setValue(next);
      if (lastSeenRef.current.dayId === dayId && lastSeenRef.current.value === next) {
        return;
      }
      lastSeenRef.current = { dayId, value: next };
      void onPersist(dayId, next.trim().length === 0 ? null : next);
    },
    [dayId, onPersist],
  );

  return { value, isSaving, handleChange };
}
