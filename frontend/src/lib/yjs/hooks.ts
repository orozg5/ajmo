"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

import type { PlanItem, PlanRole } from "@/lib/api";

import { createPlanProvider } from "./provider";
import {
  ITEM_FIELDS,
  PLAN_META_FIELDS,
  ROOT_DAY_NOTES,
  ROOT_ITEMS,
  ROOT_PLAN_META,
  type PlanMetaField,
  type PlanMetaPatch,
} from "./schema";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface UseYDocReturn {
  doc: Y.Doc | null;
  provider: HocuspocusProvider | null;
  status: ConnectionStatus;
  role: PlanRole;
  /** True once the server-side seed has been applied at least once. Lets the
   * UI fall back to REST initialDays during the first render and switch to
   * Yjs once the doc is populated. */
  isSynced: boolean;
}

export interface UseYDocOptions {
  planId: string;
  token: string | null;
  initialRole: PlanRole;
}

export function useYDoc({ planId, token, initialRole }: UseYDocOptions): UseYDocReturn {
  const [state, setState] = useState<{
    doc: Y.Doc | null;
    provider: HocuspocusProvider | null;
  }>({ doc: null, provider: null });
  const [providerStatus, setProviderStatus] =
    useState<ConnectionStatus>("connecting");
  const [isSynced, setIsSynced] = useState(false);

  useEffect(() => {
    if (!token) return;
    const { doc, provider } = createPlanProvider({ planId, token });
    // The doc/provider are owned by this effect — components downstream need
    // to re-render when they appear. setState in an effect is the right
    // pattern here despite the lint rule's general advice.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ doc, provider });
    setIsSynced(false);
    setProviderStatus("connecting");

    const onStatus = (event: { status: string }) => {
      if (event.status === "connected") setProviderStatus("connected");
      else if (event.status === "connecting") setProviderStatus("connecting");
      else setProviderStatus("disconnected");
    };
    const onSynced = () => setIsSynced(true);

    provider.on("status", onStatus);
    provider.on("synced", onSynced);

    return () => {
      provider.off("status", onStatus);
      provider.off("synced", onSynced);
      provider.destroy();
      doc.destroy();
      setState({ doc: null, provider: null });
      setIsSynced(false);
    };
  }, [planId, token]);

  // Derive status from token presence so we don't have to write to state from
  // an effect for the "no token yet" branch.
  const status: ConnectionStatus = token ? providerStatus : "disconnected";

  return {
    doc: state.doc,
    provider: state.provider,
    status,
    role: initialRole,
    isSynced,
  };
}

function snapshotItem(map: Y.Map<unknown>): PlanItem {
  const out: Record<string, unknown> = { plan_id: "" };
  for (const field of ITEM_FIELDS) {
    out[field] = map.get(field) ?? null;
  }
  return out as unknown as PlanItem;
}

function sortBySortKey<T extends { sort_key: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const left = a.sort_key ?? "";
    const right = b.sort_key ?? "";
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });
}

function fingerprintItems(arr: Y.Array<Y.Map<unknown>>): string {
  return arr
    .toArray()
    .map((entry) =>
      ITEM_FIELDS.map((field) => `${field}=${String(entry.get(field) ?? "")}`).join("/"),
    )
    .join("|");
}

interface ItemsCache {
  doc: Y.Doc | null;
  key: string;
  value: Record<string, PlanItem[]>;
}

const EMPTY_ITEMS: Record<string, PlanItem[]> = Object.freeze({});

/** Subscribe to the items root map and emit a snapshot keyed by day_id. */
export function useYAllItems(doc: Y.Doc | null): Record<string, PlanItem[]> {
  const cache = useRef<ItemsCache>({ doc: null, key: "", value: EMPTY_ITEMS });

  const subscribe = useCallback(
    (callback: () => void) => {
      if (!doc) return () => {};
      const itemsRoot = doc.getMap(ROOT_ITEMS);
      const handler = () => callback();
      itemsRoot.observeDeep(handler);
      return () => itemsRoot.unobserveDeep(handler);
    },
    [doc],
  );

  const getSnapshot = useCallback((): Record<string, PlanItem[]> => {
    if (cache.current.doc !== doc) {
      cache.current = { doc, key: "", value: EMPTY_ITEMS };
    }
    if (!doc) return cache.current.value;
    const itemsRoot = doc.getMap(ROOT_ITEMS);
    const dayIds = Array.from(itemsRoot.keys());
    const fingerprint = dayIds
      .map((dayId) => {
        const arr = itemsRoot.get(dayId) as Y.Array<Y.Map<unknown>> | undefined;
        return arr ? `${dayId}#${fingerprintItems(arr)}` : `${dayId}#`;
      })
      .join("||");
    if (fingerprint !== cache.current.key) {
      const next: Record<string, PlanItem[]> = {};
      for (const dayId of dayIds) {
        const arr = itemsRoot.get(dayId) as Y.Array<Y.Map<unknown>> | undefined;
        if (!arr) continue;
        next[dayId] = sortBySortKey(arr.toArray().map((entry) => snapshotItem(entry)));
      }
      cache.current = { doc, key: fingerprint, value: next };
    }
    return cache.current.value;
  }, [doc]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

interface NotesCache {
  doc: Y.Doc | null;
  key: string;
  value: Record<string, string>;
}

const EMPTY_NOTES: Record<string, string> = Object.freeze({});

/** Subscribe to the day_notes map and emit a snapshot. */
export function useYAllDayNotes(doc: Y.Doc | null): Record<string, string> {
  const cache = useRef<NotesCache>({ doc: null, key: "", value: EMPTY_NOTES });

  const subscribe = useCallback(
    (callback: () => void) => {
      if (!doc) return () => {};
      const notesRoot = doc.getMap(ROOT_DAY_NOTES);
      const handler = () => callback();
      notesRoot.observe(handler);
      return () => notesRoot.unobserve(handler);
    },
    [doc],
  );

  const getSnapshot = useCallback((): Record<string, string> => {
    if (cache.current.doc !== doc) {
      cache.current = { doc, key: "", value: EMPTY_NOTES };
    }
    if (!doc) return cache.current.value;
    const notesRoot = doc.getMap(ROOT_DAY_NOTES);
    const next: Record<string, string> = {};
    for (const dayId of Array.from(notesRoot.keys())) {
      const value = notesRoot.get(dayId);
      if (typeof value === "string") next[dayId] = value;
    }
    const fingerprint = Object.entries(next)
      .map(([dayId, notes]) => `${dayId}=${notes}`)
      .sort()
      .join("|");
    if (fingerprint !== cache.current.key) {
      cache.current = { doc, key: fingerprint, value: next };
    }
    return cache.current.value;
  }, [doc]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

interface PlanMetaCache {
  doc: Y.Doc | null;
  key: string;
  value: PlanMetaPatch;
}

const EMPTY_PLAN_META: PlanMetaPatch = Object.freeze({});

/** Subscribe to the plan_meta broadcast map. Returns whichever fields have
 * been published by the most recent saver — keys not present here mean no
 * one has broadcast that field, so the caller falls back to its REST props.
 */
export function useYPlanMeta(doc: Y.Doc | null): PlanMetaPatch {
  const cache = useRef<PlanMetaCache>({ doc: null, key: "", value: EMPTY_PLAN_META });

  const subscribe = useCallback(
    (callback: () => void) => {
      if (!doc) return () => {};
      const root = doc.getMap(ROOT_PLAN_META);
      const handler = () => callback();
      root.observe(handler);
      return () => root.unobserve(handler);
    },
    [doc],
  );

  const getSnapshot = useCallback((): PlanMetaPatch => {
    if (cache.current.doc !== doc) {
      cache.current = { doc, key: "", value: EMPTY_PLAN_META };
    }
    if (!doc) return cache.current.value;
    const root = doc.getMap(ROOT_PLAN_META);
    const next: PlanMetaPatch = {};
    for (const field of PLAN_META_FIELDS) {
      if (root.has(field)) {
        const value = root.get(field);
        next[field as PlanMetaField] = typeof value === "string" ? value : null;
      }
    }
    const fingerprint = PLAN_META_FIELDS.map((field) =>
      field in next ? `${field}=${next[field] ?? "<null>"}` : `${field}=<absent>`,
    ).join("|");
    if (fingerprint !== cache.current.key) {
      cache.current = { doc, key: fingerprint, value: next };
    }
    return cache.current.value;
  }, [doc]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
