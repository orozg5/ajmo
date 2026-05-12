"use client";

import { useEffect, useState } from "react";

export interface UseOnlineStatusReturn {
  online: boolean;
}

/** Subscribe to the browser's network connectivity state.
 *
 * `navigator.onLine` reflects the OS-level guess at network reachability — it
 * flips on the same `online`/`offline` events the spec defines, and we mirror
 * that into React state so consumers can render conditionally.
 *
 * The initial value is hardcoded `true` so the server-rendered HTML and the
 * client's first hydration render agree — reading `navigator.onLine` here
 * would diverge from the server (which has no `navigator`) and flag a
 * hydration mismatch on any consumer that branches on `online`. The first
 * effect tick reconciles with the real `navigator.onLine` once hydration has
 * committed, which is the right time to pick up an actual offline state. */
export function useOnlineStatus(): UseOnlineStatusReturn {
  const [online, setOnline] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    // Re-read once via the same setter so a tab restored from background
    // while offline gets the right initial value. The setState lint-rule
    // flags this; the call is functionally equivalent to a useState
    // initializer except it re-runs after subscription is attached, which
    // is the whole point — closes the race where the value flipped between
    // the lazy initializer and the listener attaching.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { online };
}
