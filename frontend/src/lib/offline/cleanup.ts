"use client";

import { PLAN_PERSISTENCE_PREFIX, planPersistenceName } from "@/lib/yjs/provider";

/** Drop the IndexedDB database that backs a single plan's Y.Doc. Call when the
 * user is removed from a plan (authorize returns 403/404) or when they delete
 * the plan, so stale offline edits can't outlive their access. Best-effort —
 * if `indexedDB.deleteDatabase` fails (e.g. the browser is mid-write to the
 * same DB), the call is logged and ignored; the data is at worst orphaned and
 * cleaned up on the next sign-out sweep. */
export async function destroyPlanPersistence(planId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await deleteDatabase(planPersistenceName(planId));
}

/** Drop every Yjs plan database for the current browser profile. Called on
 * Supabase SIGNED_OUT — we don't want one user's offline edits surfacing
 * inside the next user's session on a shared device. */
export async function destroyAllPlanPersistence(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  // `databases()` is supported in Chromium and recent Safari/Firefox. When
  // missing, we silently no-op — the per-plan deletion path still works on
  // explicit triggers, and stale data is bounded to the user's session.
  if (typeof indexedDB.databases !== "function") return;
  let entries: IDBDatabaseInfo[];
  try {
    entries = await indexedDB.databases();
  } catch (error) {
    console.warn("Failed to enumerate IndexedDB databases", error);
    return;
  }
  await Promise.all(
    entries
      .map((entry) => entry.name)
      .filter(
        (name): name is string =>
          typeof name === "string" && name.startsWith(PLAN_PERSISTENCE_PREFIX),
      )
      .map((name) => deleteDatabase(name)),
  );
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    // `blocked` fires when other open connections hold the DB open. We log
    // and resolve — the deletion will eventually complete once the open
    // connections close, and the next session-start sweep will retry.
    request.onblocked = () => {
      console.warn(`IndexedDB delete blocked: ${name}`);
      resolve();
    };
    request.onerror = () => {
      console.warn(`IndexedDB delete failed: ${name}`, request.error);
      resolve();
    };
  });
}
