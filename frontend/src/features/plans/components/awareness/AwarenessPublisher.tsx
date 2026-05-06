"use client";

import { useEffect } from "react";

import { usePlanCollab } from "@/features/plans/hooks/PlanCollabContext";
import type { AwarenessState } from "@/lib/yjs/schema";

/**
 * Headless component — owns the local awareness state for this plan room.
 *
 * Sets the user identity once the provider + profile are resolved, and
 * cleans up on unmount. The `editing` field is written by the components
 * that own each free-text surface (`useEditingReporter` from notes
 * editors, `CommentsSheet` for the comment composer); this component
 * just establishes the user identity and a clean initial state.
 */
export default function AwarenessPublisher() {
  const { provider, currentUser } = usePlanCollab();

  useEffect(() => {
    if (!provider?.awareness) return;
    if (!currentUser) {
      provider.awareness.setLocalState(null);
      return;
    }
    const initial: AwarenessState = {
      user: currentUser,
      editing: null,
    };
    provider.awareness.setLocalState(initial);
    return () => {
      provider.awareness?.setLocalState(null);
    };
  }, [provider, currentUser]);

  return null;
}
