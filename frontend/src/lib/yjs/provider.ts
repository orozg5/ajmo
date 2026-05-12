"use client";

import { HocuspocusProvider } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

import {
  ROOT_COMMENTS,
  ROOT_DAY_NOTES,
  ROOT_ITEMS,
  ROOT_LIKES,
  ROOT_RATINGS,
} from "./schema";

const COLLAB_URL = process.env.NEXT_PUBLIC_COLLAB_URL ?? "ws://localhost:1234";

export const PLAN_PERSISTENCE_PREFIX = "ajmo:plan:";

export function planPersistenceName(planId: string): string {
  return `${PLAN_PERSISTENCE_PREFIX}${planId}`;
}

export interface CreatePlanDocOptions {
  planId: string;
}

export interface CreatePlanDocResult {
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  /** Resolves once the IndexedDB-backed Y.Doc state has been replayed into
   * the in-memory CRDT. The Hocuspocus provider must NOT be constructed
   * until this resolves — otherwise the websocket sync handshake races the
   * IDB hydration and the server's state can land in the doc before the
   * cached offline edits, dropping them on the next sync. */
  localLoaded: Promise<void>;
}

export interface CreatePlanProviderOptions {
  doc: Y.Doc;
  planId: string;
  token: string;
}

/** Eagerly create the top-level Yjs containers so observers attach before
 * the server's seed update arrives. Without this, hooks subscribing on
 * mount might watch a stale shape. */
function ensureRoots(doc: Y.Doc): void {
  doc.getMap(ROOT_ITEMS);
  doc.getMap(ROOT_DAY_NOTES);
  doc.getMap(ROOT_LIKES);
  doc.getMap(ROOT_RATINGS);
  doc.getArray(ROOT_COMMENTS);
}

/** Create the Y.Doc and attach IndexedDB persistence. Decoupled from the
 * websocket provider on purpose: the doc's lifetime is tied to the open
 * plan (which planId is being viewed), not to whether we currently have a
 * valid auth token. Supabase can fail to refresh while offline; if the doc
 * were tied to the token, edits would have nowhere to land.
 *
 * The persistence's `whenSynced` is exposed as `localLoaded`. Callers
 * (`useYDoc`) MUST await it before constructing a `HocuspocusProvider` on
 * the same doc — see the CreatePlanDocResult comment. */
export function createPlanDoc({ planId }: CreatePlanDocOptions): CreatePlanDocResult {
  const doc = new Y.Doc();
  ensureRoots(doc);

  const persistence = new IndexeddbPersistence(planPersistenceName(planId), doc);
  const localLoaded = persistence.whenSynced.then(() => {
    /* swallow the IndexeddbPersistence resolution value */
  });

  return { doc, persistence, localLoaded };
}

/** Attach a Hocuspocus websocket provider to an already-created Y.Doc. The
 * caller is responsible for awaiting `localLoaded` from createPlanDoc before
 * calling this — once the provider connects, its sync handshake exchanges
 * state vectors with the server, and any updates applied to the doc *after*
 * the handshake (e.g. by a late-arriving IndexedDB hydration) can be missed
 * by the server until the next round-trip. Cleaner to gate construction. */
export function createPlanProvider({
  doc,
  planId,
  token,
}: CreatePlanProviderOptions): HocuspocusProvider {
  return new HocuspocusProvider({
    url: COLLAB_URL,
    name: planId,
    token,
    document: doc,
  });
}
