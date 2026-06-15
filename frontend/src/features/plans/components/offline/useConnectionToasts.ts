"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";

/** Flap window — long enough to swallow sub-second network blips (TCP retransmits, wifi beacon misses), short enough to surface a genuine outage. */
const FLAP_DEBOUNCE_MS = 5_000;

const OFFLINE_TOAST_ID = "offline-status";
const ONLINE_TOAST_ID = "online-status";

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
