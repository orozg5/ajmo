"use client";

import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { AsyncStorage } from "@tanstack/query-persist-client-core";
import { del, get, set } from "idb-keyval";

/** A React Query AsyncStorage adapter backed by `idb-keyval`. The library
 * already bundles an IndexedDB-backed key/value store; we bridge its
 * `get/set/del` API to the `getItem/setItem/removeItem` shape that React
 * Query's persisters expect. */
const idbStorage: AsyncStorage<string> = {
  async getItem(key) {
    const value = await get<string>(key);
    return value ?? null;
  },
  async setItem(key, value) {
    await set(key, value);
  },
  async removeItem(key) {
    await del(key);
  },
};

/** Singleton persister. Keep one instance per page load — multiple
 * persisters sharing the same IndexedDB key would race each other on save.
 * `key` is namespaced so an Ajmo install never clashes with another app on
 * the same origin. */
export const queryPersister = createAsyncStoragePersister({
  storage: typeof window === "undefined" ? null : idbStorage,
  key: "ajmo:react-query-cache",
  // 1 s of debounce keeps the persister from firing on every refetch tick
  // during a fast burst (e.g. an itinerary stream) while still flushing
  // quickly enough that closing the tab loses at most one tick.
  throttleTime: 1_000,
});
