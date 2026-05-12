"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

import type { PlanItem, PlanRole } from "@/lib/api";

import { createPlanDoc, createPlanProvider } from "./provider";
import {
  COMMENT_FIELDS,
  ITEM_FIELDS,
  PLAN_META_FIELDS,
  ROOT_COMMENTS,
  ROOT_DAY_NOTES,
  ROOT_ITEMS,
  ROOT_LIKES,
  ROOT_PLAN_META,
  ROOT_RATINGS,
  type AwarenessState,
  type CommentField,
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
  /** True once the IndexedDB-backed Y.Doc state has finished hydrating into
   * the in-memory CRDT. Components that block their first paint on this can
   * avoid a flash of empty state when opening a plan offline or before the
   * websocket connects. */
  localLoaded: boolean;
  /** True while the local Y.Doc has writes that haven't been flushed to the
   * Hocuspocus server yet. Drives the connection-status badge's "Saving…"
   * state. Kept up-to-date via the provider's `unsyncedChanges` event. */
  hasUnsyncedChanges: boolean;
}

export interface UseYDocOptions {
  planId: string;
  token: string | null;
  initialRole: PlanRole;
}

export function useYDoc({ planId, token, initialRole }: UseYDocOptions): UseYDocReturn {
  // The Y.Doc + IndexedDB persistence live for as long as the user is on
  // this plan, regardless of whether they currently have a valid auth token.
  // Tying their lifecycle to (planId, token) caused two regressions: (a) on
  // OS-level offline, Supabase couldn't refresh the session, token went null,
  // and the doc was destroyed — edits had nowhere to land. (b) On DevTools
  // online↔offline, every token-refresh re-rendered the effect, destroyed the
  // doc + persistence, and the new persistence read stale state because
  // y-indexeddb's destroy() doesn't await pending writes (verified at
  // node_modules/y-indexeddb/...:113). Offline edits got silently dropped.
  // Splitting the effects makes the doc tied to the *resource* (planId) and
  // the provider tied to the *credential* (planId + token).
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [persistence, setPersistence] = useState<IndexeddbPersistence | null>(
    null,
  );
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [providerStatus, setProviderStatus] =
    useState<ConnectionStatus>("connecting");
  const [isSynced, setIsSynced] = useState(false);
  const [localLoaded, setLocalLoaded] = useState(false);
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false);

  // ── Doc + IndexedDB persistence — lifecycle tied to planId only ─────────
  useEffect(() => {
    const {
      doc: createdDoc,
      persistence: createdPersistence,
      localLoaded: localLoadedPromise,
    } = createPlanDoc({ planId });
    // The doc owns the in-memory CRDT; persistence owns the IDB connection.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDoc(createdDoc);
    setPersistence(createdPersistence);
    setLocalLoaded(false);

    let cancelled = false;
    void localLoadedPromise.then(() => {
      if (!cancelled) setLocalLoaded(true);
    });

    return () => {
      cancelled = true;
      // Order matters: destroy persistence first so its `doc.on("destroy")`
      // handler doesn't fire mid-teardown. We await the close Promise
      // even though it doesn't flush in-flight writes (y-indexeddb library
      // limitation, file:line 113) — at minimum it closes the IDB
      // connection cleanly, and on cross-plan navigation the DB name
      // changes so there's no race against a new instance.
      void createdPersistence.destroy();
      createdDoc.destroy();
      setDoc(null);
      setPersistence(null);
      setLocalLoaded(false);
    };
  }, [planId]);

  // ── Hocuspocus provider — lifecycle tied to (doc, token, localLoaded) ───
  // Gated on localLoaded so the IndexedDB-hydrated state lands in the doc
  // before the websocket sync handshake runs. Without this gate, the server's
  // state can be applied to an empty doc, and the late-arriving IDB updates
  // race against an already-"synced" provider that may not forward them.
  useEffect(() => {
    if (!doc || !token || !localLoaded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProvider(null);
      setProviderStatus("disconnected");
      setIsSynced(false);
      setHasUnsyncedChanges(false);
      return;
    }

    const createdProvider = createPlanProvider({ doc, planId, token });
    setProvider(createdProvider);
    setProviderStatus("connecting");
    setIsSynced(false);
    setHasUnsyncedChanges(createdProvider.hasUnsyncedChanges);

    const onStatus = (event: { status: string }) => {
      if (event.status === "connected") setProviderStatus("connected");
      else if (event.status === "connecting") setProviderStatus("connecting");
      else setProviderStatus("disconnected");
    };
    const onSynced = () => setIsSynced(true);
    const onUnsyncedChanges = (event: { number: number }) => {
      setHasUnsyncedChanges(event.number > 0);
    };

    createdProvider.on("status", onStatus);
    createdProvider.on("synced", onSynced);
    createdProvider.on("unsyncedChanges", onUnsyncedChanges);

    return () => {
      createdProvider.off("status", onStatus);
      createdProvider.off("synced", onSynced);
      createdProvider.off("unsyncedChanges", onUnsyncedChanges);
      createdProvider.destroy();
      setProvider(null);
      setProviderStatus("disconnected");
      setIsSynced(false);
      setHasUnsyncedChanges(false);
    };
  }, [doc, planId, token, localLoaded]);

  // Persistence is owned by the doc effect but not directly read elsewhere.
  // Reference it so eslint-unused-vars doesn't complain and so an inspector
  // can see what's attached.
  void persistence;

  // Derive status from token presence so we don't have to write to state from
  // an effect for the "no token yet" branch.
  const status: ConnectionStatus = token ? providerStatus : "disconnected";

  return {
    doc,
    provider,
    status,
    role: initialRole,
    isSynced,
    localLoaded,
    hasUnsyncedChanges,
  };
}

function snapshotItem(map: Y.Map<unknown>): PlanItem {
  const out: Record<string, unknown> = { plan_id: "" };
  for (const field of ITEM_FIELDS) {
    const value = map.get(field);
    // `notes` is a Y.Text after the 7f migration so concurrent edits merge
    // character-level; legacy plan_items written before the migration still
    // have a plain string in this slot, which we pass through unchanged.
    if (field === "notes") {
      out[field] = value instanceof Y.Text ? value.toString() : value ?? null;
    } else {
      out[field] = value ?? null;
    }
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

/** Subscribe to the day_notes map and emit a snapshot.
 *
 * Each value is a `Y.Text` after the 7f migration. `observeDeep` is required
 * (not `observe`) so an insert/delete *inside* a Y.Text — which doesn't
 * change the parent map's key set — still triggers a re-render. Legacy
 * plain-string entries are tolerated for plans whose `yjs_state` predates
 * the migration. */
export function useYAllDayNotes(doc: Y.Doc | null): Record<string, string> {
  const cache = useRef<NotesCache>({ doc: null, key: "", value: EMPTY_NOTES });

  const subscribe = useCallback(
    (callback: () => void) => {
      if (!doc) return () => {};
      const notesRoot = doc.getMap(ROOT_DAY_NOTES);
      const handler = () => callback();
      notesRoot.observeDeep(handler);
      return () => notesRoot.unobserveDeep(handler);
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
      if (value instanceof Y.Text) {
        next[dayId] = value.toString();
      } else if (typeof value === "string") {
        next[dayId] = value;
      }
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

// ── Likes ────────────────────────────────────────────────────────────────────

export interface LikeSummary {
  count: number;
  userIds: string[];
  mine: boolean;
}

interface LikesCache {
  doc: Y.Doc | null;
  key: string;
  value: Map<string, LikeSummary>;
}

const EMPTY_LIKES: Map<string, LikeSummary> = new Map();

/** Subscribe to the likes root. Returns a Map keyed by item_id with counts +
 * the current user's like state. */
export function useYAllLikes(
  doc: Y.Doc | null,
  currentUserId: string | null,
): Map<string, LikeSummary> {
  const cache = useRef<LikesCache>({ doc: null, key: "", value: EMPTY_LIKES });

  const subscribe = useCallback(
    (callback: () => void) => {
      if (!doc) return () => {};
      const root = doc.getMap(ROOT_LIKES);
      const handler = () => callback();
      root.observeDeep(handler);
      return () => root.unobserveDeep(handler);
    },
    [doc],
  );

  const getSnapshot = useCallback((): Map<string, LikeSummary> => {
    if (cache.current.doc !== doc) {
      cache.current = { doc, key: "", value: EMPTY_LIKES };
    }
    if (!doc) return cache.current.value;
    const root = doc.getMap(ROOT_LIKES) as Y.Map<Y.Map<boolean>>;
    const out = new Map<string, LikeSummary>();
    const fingerprintParts: string[] = [];
    for (const itemId of Array.from(root.keys())) {
      const inner = root.get(itemId);
      if (!inner) continue;
      const userIds = Array.from(inner.keys()).sort();
      if (userIds.length === 0) continue;
      const mine = currentUserId != null && inner.has(currentUserId);
      out.set(itemId, { count: userIds.length, userIds, mine });
      fingerprintParts.push(`${itemId}:${userIds.join(",")}`);
    }
    const fingerprint = `${currentUserId ?? ""}|${fingerprintParts.sort().join("|")}`;
    if (fingerprint !== cache.current.key) {
      cache.current = { doc, key: fingerprint, value: out };
    }
    return cache.current.value;
  }, [doc, currentUserId]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ── Ratings ──────────────────────────────────────────────────────────────────

export interface RatingSummary {
  avg: number;
  count: number;
  mine: number | null;
}

interface RatingsCache {
  doc: Y.Doc | null;
  key: string;
  value: Map<string, RatingSummary>;
}

const EMPTY_RATINGS: Map<string, RatingSummary> = new Map();

export function useYAllRatings(
  doc: Y.Doc | null,
  currentUserId: string | null,
): Map<string, RatingSummary> {
  const cache = useRef<RatingsCache>({ doc: null, key: "", value: EMPTY_RATINGS });

  const subscribe = useCallback(
    (callback: () => void) => {
      if (!doc) return () => {};
      const root = doc.getMap(ROOT_RATINGS);
      const handler = () => callback();
      root.observeDeep(handler);
      return () => root.unobserveDeep(handler);
    },
    [doc],
  );

  const getSnapshot = useCallback((): Map<string, RatingSummary> => {
    if (cache.current.doc !== doc) {
      cache.current = { doc, key: "", value: EMPTY_RATINGS };
    }
    if (!doc) return cache.current.value;
    const root = doc.getMap(ROOT_RATINGS) as Y.Map<Y.Map<number>>;
    const out = new Map<string, RatingSummary>();
    const fingerprintParts: string[] = [];
    for (const itemId of Array.from(root.keys())) {
      const inner = root.get(itemId);
      if (!inner) continue;
      let sum = 0;
      let count = 0;
      let mine: number | null = null;
      const partsForItem: string[] = [];
      for (const userId of Array.from(inner.keys())) {
        const stars = inner.get(userId);
        if (typeof stars !== "number") continue;
        sum += stars;
        count += 1;
        if (currentUserId && userId === currentUserId) mine = stars;
        partsForItem.push(`${userId}=${stars}`);
      }
      if (count === 0) continue;
      out.set(itemId, { avg: sum / count, count, mine });
      fingerprintParts.push(`${itemId}:${partsForItem.sort().join(",")}`);
    }
    const fingerprint = `${currentUserId ?? ""}|${fingerprintParts.sort().join("|")}`;
    if (fingerprint !== cache.current.key) {
      cache.current = { doc, key: fingerprint, value: out };
    }
    return cache.current.value;
  }, [doc, currentUserId]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ── Comments ─────────────────────────────────────────────────────────────────

export interface CommentSnapshot {
  id: string;
  plan_item_id: string | null;
  parent_id: string | null;
  author_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function snapshotComment(map: Y.Map<unknown>): CommentSnapshot {
  const out: Record<string, unknown> = {};
  for (const field of COMMENT_FIELDS as readonly CommentField[]) {
    out[field] = map.get(field) ?? null;
  }
  // body is not nullable in DB; coerce explicitly.
  if (typeof out.body !== "string") out.body = "";
  return out as unknown as CommentSnapshot;
}

interface CommentsCache {
  doc: Y.Doc | null;
  key: string;
  value: CommentSnapshot[];
}

const EMPTY_COMMENTS: CommentSnapshot[] = [];

export function useYComments(doc: Y.Doc | null): CommentSnapshot[] {
  const cache = useRef<CommentsCache>({ doc: null, key: "", value: EMPTY_COMMENTS });

  const subscribe = useCallback(
    (callback: () => void) => {
      if (!doc) return () => {};
      const root = doc.getArray(ROOT_COMMENTS);
      const handler = () => callback();
      root.observeDeep(handler);
      return () => root.unobserveDeep(handler);
    },
    [doc],
  );

  const getSnapshot = useCallback((): CommentSnapshot[] => {
    if (cache.current.doc !== doc) {
      cache.current = { doc, key: "", value: EMPTY_COMMENTS };
    }
    if (!doc) return cache.current.value;
    const root = doc.getArray(ROOT_COMMENTS) as Y.Array<Y.Map<unknown>>;
    const snapshots: CommentSnapshot[] = [];
    for (let index = 0; index < root.length; index += 1) {
      const map = root.get(index);
      if (!map) continue;
      snapshots.push(snapshotComment(map));
    }
    snapshots.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const fingerprint = snapshots
      .map(
        (entry) =>
          `${entry.id}:${entry.parent_id ?? ""}:${entry.body}:${entry.deleted_at ?? ""}:${entry.updated_at}`,
      )
      .join("|");
    if (fingerprint !== cache.current.key) {
      cache.current = { doc, key: fingerprint, value: snapshots };
    }
    return cache.current.value;
  }, [doc]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ── Awareness (presence + typing) ───────────────────────────────────────────

export interface RemoteAwarenessEntry extends AwarenessState {
  clientId: number;
}

interface AwarenessCache {
  provider: HocuspocusProvider | null;
  key: string;
  value: RemoteAwarenessEntry[];
}

const EMPTY_AWARENESS: RemoteAwarenessEntry[] = [];

/** Subscribe to the provider's awareness channel. Returns the list of remote
 * client states (excluding our own). Fingerprinting on user/focus/typing only
 * keeps useSyncExternalStore from rerendering on every awareness ping. */
export function useRemoteAwareness(
  provider: HocuspocusProvider | null,
): RemoteAwarenessEntry[] {
  const cache = useRef<AwarenessCache>({ provider: null, key: "", value: EMPTY_AWARENESS });

  const subscribe = useCallback(
    (callback: () => void) => {
      if (!provider) return () => {};
      const handler = () => callback();
      provider.awareness?.on("change", handler);
      return () => {
        provider.awareness?.off("change", handler);
      };
    },
    [provider],
  );

  const getSnapshot = useCallback((): RemoteAwarenessEntry[] => {
    if (cache.current.provider !== provider) {
      cache.current = { provider, key: "", value: EMPTY_AWARENESS };
    }
    if (!provider?.awareness) return cache.current.value;
    const localId = provider.awareness.clientID;
    const states = provider.awareness.getStates() as Map<number, AwarenessState | undefined>;
    const out: RemoteAwarenessEntry[] = [];
    for (const [clientId, state] of states) {
      if (clientId === localId) continue;
      if (!state || !state.user || !state.user.id) continue;
      out.push({ clientId, ...state });
    }
    out.sort((a, b) => a.clientId - b.clientId);
    const fingerprint = out
      .map(
        (entry) =>
          `${entry.clientId}:${entry.user.id}:${entry.editing ? `${entry.editing.kind}:${entry.editing.id}` : ""}`,
      )
      .join("|");
    if (fingerprint !== cache.current.key) {
      cache.current = { provider, key: fingerprint, value: out };
    }
    return cache.current.value;
  }, [provider]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
