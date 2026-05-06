"use client";

import { useCallback, useEffect, useRef } from "react";

import { usePlanCollab } from "@/features/plans/hooks/PlanCollabContext";
import type { EditingKind, EditingTarget } from "@/lib/yjs/schema";

interface EditingReporter {
  reportFocus: () => void;
  reportBlur: () => void;
}

/**
 * Imperative reporter for "this user is now editing free text on
 * `{kind, id}`." Wired to onFocus/onBlur of a textarea (or similar
 * editable surface) so peers can render an `EditingPresence` avatar
 * pill next to that exact label.
 *
 * Last-write-wins on the local state: if focus jumps from one surface
 * to another, the second `reportFocus` overwrites the first; only when
 * we blur the surface that's currently published do we clear it. This
 * keeps quick focus transitions smooth and avoids a momentary "no one
 * is editing" frame between two adjacent textareas.
 *
 * The hook also clears the awareness `editing` field on unmount, so a
 * day card or item card disappearing mid-edit (rare, but possible if the
 * day is removed) doesn't leave a phantom presence pill.
 */
export function useEditingReporter(
  kind: EditingKind,
  id: string,
): EditingReporter {
  const { provider } = usePlanCollab();
  const ownsRef = useRef(false);

  const reportFocus = useCallback(() => {
    if (!provider?.awareness) return;
    const target: EditingTarget = { kind, id };
    provider.awareness.setLocalStateField("editing", target);
    ownsRef.current = true;
  }, [provider, kind, id]);

  const reportBlur = useCallback(() => {
    if (!provider?.awareness) return;
    if (!ownsRef.current) return;
    const current = provider.awareness.getLocalState() as
      | { editing?: EditingTarget | null }
      | undefined;
    const editing = current?.editing ?? null;
    if (editing && editing.kind === kind && editing.id === id) {
      provider.awareness.setLocalStateField("editing", null);
    }
    ownsRef.current = false;
  }, [provider, kind, id]);

  // Cleanup on unmount: if we were the most recent reporter, clear our
  // contribution so peers don't see a stuck pill.
  useEffect(() => {
    return () => {
      if (!provider?.awareness) return;
      if (!ownsRef.current) return;
      const current = provider.awareness.getLocalState() as
        | { editing?: EditingTarget | null }
        | undefined;
      const editing = current?.editing ?? null;
      if (editing && editing.kind === kind && editing.id === id) {
        provider.awareness.setLocalStateField("editing", null);
      }
    };
  }, [provider, kind, id]);

  return { reportFocus, reportBlur };
}
