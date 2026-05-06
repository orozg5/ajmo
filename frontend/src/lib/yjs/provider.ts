"use client";

import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

import { ROOT_DAY_NOTES, ROOT_ITEMS } from "./schema";

export interface CreateProviderOptions {
  planId: string;
  token: string;
}

export interface CreateProviderResult {
  doc: Y.Doc;
  provider: HocuspocusProvider;
}

const COLLAB_URL = process.env.NEXT_PUBLIC_COLLAB_URL ?? "ws://localhost:1234";

/** Eagerly create the top-level Yjs containers so observers attach before
 * the server's seed update arrives. Without this, hooks subscribing on
 * mount might watch a stale shape. */
function ensureRoots(doc: Y.Doc): void {
  doc.getMap(ROOT_ITEMS);
  doc.getMap(ROOT_DAY_NOTES);
}

export function createPlanProvider({
  planId,
  token,
}: CreateProviderOptions): CreateProviderResult {
  const doc = new Y.Doc();
  ensureRoots(doc);

  const provider = new HocuspocusProvider({
    url: COLLAB_URL,
    name: planId,
    token,
    document: doc,
  });

  return { doc, provider };
}
