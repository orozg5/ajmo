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

/** Local-state wrapper around the Y.Doc-backed `onPersist`.
 *
 * The textarea is controlled, so we hold a `value` in React state. The
 * subtlety is that every keystroke writes to the Y.Doc, the Y.Doc observer
 * re-renders the parent, and the parent passes a new `initial` back. Naively
 * resetting `value` from `initial` on every change creates a controlled-input
 * echo: under certain delete sequences React commits a frame where the local
 * `value` and the just-arrived `initial` disagree, and the field appears to
 * snap back to the previous text.
 *
 * The fix is to only sync `initial → value` when `initial` reflects a change
 * we *didn't* make — i.e. a remote edit, a day-switch, or a fresh page load.
 * `lastSeenRef` records the last (dayId, value) we either wrote or accepted,
 * so the effect can skip echoes of our own writes. */
export function useDayNotes({
  dayId,
  initial,
  onPersist,
}: UseDayNotesOptions): UseDayNotesReturn {
  const [value, setValue] = useState<string>(initial ?? "");
  // Kept on the API for backwards compatibility with DayNotesEditor's UI;
  // since onPersist now writes to a Y.Doc synchronously the spinner never
  // realistically flips on, but leaving the field avoids an unrelated
  // component change.
  const [isSaving] = useState(false);
  const lastSeenRef = useRef<LastSeen>({ dayId, value: initial ?? "" });

  useEffect(() => {
    const incoming = initial ?? "";
    // Day switch: always reset, even if the new day's notes happen to match
    // what we last saw on the previous day.
    if (lastSeenRef.current.dayId !== dayId) {
      lastSeenRef.current = { dayId, value: incoming };
      setValue(incoming);
      return;
    }
    // Same day: only adopt `initial` if it diverges from what we last
    // wrote/accepted. Echoes of our own keystrokes match and are ignored.
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
      // Fire-and-forget — onPersist writes to the Y.Doc, which is sync; the
      // returned Promise completes on the next microtask. No debounce: every
      // keystroke produces a tiny CRDT update and Hocuspocus already
      // coalesces concurrent updates server-side.
      void onPersist(dayId, next.trim().length === 0 ? null : next);
    },
    [dayId, onPersist],
  );

  return { value, isSaving, handleChange };
}
