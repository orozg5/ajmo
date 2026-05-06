"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseItemNotesOptions {
  itemId: string;
  initial: string | null;
  onPersist: (notes: string | null) => void;
}

export interface UseItemNotesReturn {
  value: string;
  handleChange: (next: string) => void;
}

interface LastSeen {
  itemId: string;
  value: string;
}

/** Live-sync local-state wrapper around the Y.Doc-backed item-note write.
 *
 * Same pattern as `useDayNotes`: every keystroke lands in the Y.Doc, the
 * Y.Doc observer re-renders the parent, and the parent passes a fresh
 * `initial` back. We track the last value we wrote/accepted in a ref so
 * the effect can skip echoes of our own writes; only genuine remote
 * edits and item swaps cause a `setValue`. */
export function useItemNotes({
  itemId,
  initial,
  onPersist,
}: UseItemNotesOptions): UseItemNotesReturn {
  const [value, setValue] = useState<string>(initial ?? "");
  const lastSeenRef = useRef<LastSeen>({ itemId, value: initial ?? "" });

  useEffect(() => {
    const incoming = initial ?? "";
    if (lastSeenRef.current.itemId !== itemId) {
      lastSeenRef.current = { itemId, value: incoming };
      setValue(incoming);
      return;
    }
    if (lastSeenRef.current.value !== incoming) {
      lastSeenRef.current = { itemId, value: incoming };
      setValue(incoming);
    }
  }, [itemId, initial]);

  const handleChange = useCallback(
    (next: string) => {
      setValue(next);
      if (
        lastSeenRef.current.itemId === itemId &&
        lastSeenRef.current.value === next
      ) {
        return;
      }
      lastSeenRef.current = { itemId, value: next };
      onPersist(next.trim().length === 0 ? null : next);
    },
    [itemId, onPersist],
  );

  return { value, handleChange };
}
