"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";

/** Threshold in ms below which a flap is treated as transient and silenced.
 * Real network blips (a TCP retransmit, a wifi beacon miss) flap on/off in
 * sub-second windows; the user does not benefit from a toast for that. The
 * 5 s window is long enough to filter out routine transients while short
 * enough that a genuine outage still gets surfaced quickly. */
const FLAP_DEBOUNCE_MS = 5_000;

const OFFLINE_TOAST_ID = "offline-status";
const ONLINE_TOAST_ID = "online-status";

/** Fires a single sonner toast on each meaningful online↔offline transition.
 * Quiet by design — only the first transition in a 5 s window emits a toast,
 * matching/dismissing the previously-shown toast id so we never stack two
 * conflicting notifications.
 *
 * Mount once near the top of the plan workspace tree. */
export function useConnectionToasts(): void {
  const { online } = useOnlineStatus();
  const lastEmittedRef = useRef<{ value: boolean | null; at: number }>({
    value: null,
    at: 0,
  });

  useEffect(() => {
    const last = lastEmittedRef.current;
    const now = Date.now();
    if (last.value === online) return;
    if (last.value !== null && now - last.at < FLAP_DEBOUNCE_MS) {
      lastEmittedRef.current = { value: online, at: now };
      return;
    }

    if (online) {
      toast.dismiss(OFFLINE_TOAST_ID);
      toast.success("Back online. Your changes are syncing.", {
        id: ONLINE_TOAST_ID,
        duration: 3_000,
      });
    } else {
      toast.dismiss(ONLINE_TOAST_ID);
      toast.warning("You're offline. Edits are saved locally and will sync when you reconnect.", {
        id: OFFLINE_TOAST_ID,
        duration: 6_000,
      });
    }
    lastEmittedRef.current = { value: online, at: now };
  }, [online]);
}
