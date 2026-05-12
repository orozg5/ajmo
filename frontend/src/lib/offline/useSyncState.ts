"use client";

import { useEffect, useState } from "react";
import type { HocuspocusProvider } from "@hocuspocus/provider";

import { useOnlineStatus } from "./useOnlineStatus";

/** The plan workspace surfaces one of these to the user via the connection
 * status badge. Drives icon, label, and the toast we fire on transitions.
 *
 * - `"online-synced"` — green dot, "Synced".
 * - `"online-saving"` — amber spinner, "Saving…". Either the local Y.Doc has
 *   buffered writes, or the websocket is mid-handshake (initial sync) but the
 *   browser thinks it's online.
 * - `"reconnecting"` — amber spinner, "Reconnecting…". Browser is online, but
 *   the websocket lost the connection and Hocuspocus' built-in retry hasn't
 *   re-established it yet.
 * - `"offline-saved-locally"` — grey cloud-off icon, "Offline — changes saved
 *   locally". navigator.onLine is false; y-indexeddb buffers everything until
 *   the network returns. */
export type SyncState =
  | "online-synced"
  | "online-saving"
  | "reconnecting"
  | "offline-saved-locally";

export interface UseSyncStateOptions {
  provider: HocuspocusProvider | null;
}

export interface UseSyncStateReturn {
  syncState: SyncState;
  online: boolean;
}

/** Compose the browser's online status with the Hocuspocus provider's
 * sync/connection state into a single label the badge can render. The
 * controller subscribes to the provider's `status`, `synced`, and
 * `unsyncedChanges` events so the badge updates without polling. */
export function useSyncState({ provider }: UseSyncStateOptions): UseSyncStateReturn {
  const { online } = useOnlineStatus();
  const [providerStatus, setProviderStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >(provider ? (provider.synced ? "connected" : "connecting") : "disconnected");
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState<boolean>(
    provider ? provider.hasUnsyncedChanges : false,
  );

  useEffect(() => {
    if (!provider) {
      // Reset to defaults when the provider is torn down (plan close, sign
      // out). Without this, a brand-new provider would briefly inherit the
      // previous one's status/unsynced flags. The setState lint-rule flags
      // this; the alternative — a useReducer keyed by provider identity —
      // adds more code than it saves clarity.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProviderStatus("disconnected");
      setHasUnsyncedChanges(false);
      return;
    }

    // Snap to the provider's current values immediately so the badge
    // doesn't flicker through a stale frame on remount with an existing
    // provider (e.g. plan switch via the dashboard).
    setProviderStatus(provider.synced ? "connected" : "connecting");
    setHasUnsyncedChanges(provider.hasUnsyncedChanges);

    function handleStatus(event: { status: string }) {
      if (event.status === "connected") setProviderStatus("connected");
      else if (event.status === "connecting") setProviderStatus("connecting");
      else setProviderStatus("disconnected");
    }
    function handleUnsynced(event: { number: number }) {
      setHasUnsyncedChanges(event.number > 0);
    }

    provider.on("status", handleStatus);
    provider.on("unsyncedChanges", handleUnsynced);

    return () => {
      provider.off("status", handleStatus);
      provider.off("unsyncedChanges", handleUnsynced);
    };
  }, [provider]);

  let syncState: SyncState;
  if (!online) {
    syncState = "offline-saved-locally";
  } else if (providerStatus !== "connected") {
    syncState = "reconnecting";
  } else if (hasUnsyncedChanges) {
    syncState = "online-saving";
  } else {
    syncState = "online-synced";
  }

  return { syncState, online };
}
