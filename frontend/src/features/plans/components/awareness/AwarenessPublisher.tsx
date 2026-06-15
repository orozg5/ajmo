"use client";

import { useEffect } from "react";

import { usePlanCollab } from "@/features/plans/hooks/PlanCollabContext";
import type { AwarenessState } from "@/lib/yjs/schema";

/** Establishes user identity + clean initial awareness state. The `editing` field is written by the components owning each free-text surface (`useEditingReporter`, `CommentsSheet`). */
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
