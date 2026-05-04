# Phase 7 — Offline + PWA

**Exit bar**: opening the app offline shows the last-seen dashboard + last-opened plan, allows edits, and syncs cleanly on reconnect. Install prompt works on desktop + Android.

## In scope

### Service worker

- [ ] `next-pwa` configured with strategies per route (see `docs/OFFLINE.md` table).
- [ ] App shell (`/`, `/plans`, `/plans/[id]`) — cache-first, update in background.
- [ ] `_next/static/*` — cache-first, immutable.
- [ ] `/api/*` — network-first, stale-while-revalidate.
- [ ] MapLibre tile URLs — LRU cache, 50 MB cap, 7-day max age.
- [ ] Supabase Storage (covers, avatars) — cache-first, 1-day max age.
- [ ] Supabase Auth (`/auth/v1/*`) — network-only (no caching).
- [ ] `/offline` fallback route — minimal shell + cached plan links.

### Install prompt

- [ ] Web manifest with `short_name`, `theme_color` matching `--primary`, icons at 192/512.
- [ ] Custom install button in dashboard footer when `beforeinstallprompt` fires; hidden on iOS (Apple prompts automatically).

### React Query persistence

- [ ] `@tanstack/query-async-storage-persister` + `idb-keyval`.
- [ ] Selective persistence: queries tagged `{ persist: true }` only — plan lists, plan detail, comments. Transient (autocomplete, SSE streams) skip.
- [ ] `onlineManager.setOnline(navigator.onLine)` + `window.online/offline` listeners.

### Yjs offline

- [ ] Verify Phase 6's `y-indexeddb` provider persists edits across reloads.
- [ ] Reconnect semantics: vector-clock exchange merges local ops into shared doc. Observable via two-browser Playwright scenario from Phase 6.

### Write queue for non-Yjs mutations

- [ ] `frontend/src/lib/offline/writeQueue.ts` — IndexedDB-backed queue via `idb-keyval`.
- [ ] Entries: `{id, endpoint, method, payload, attemptedAt, retries}`.
- [ ] Drain on `online` event with exponential backoff; 5-retry cap → move to "needs attention" list surfaced via toast.
- [ ] Covers: comments, ratings, reactions, avatar uploads, profile edits.

### UI affordances

- [ ] Offline pill in header — Zustand store reading `navigator.onLine + navigator.connection.effectiveType`.
- [ ] Queued-mutation badge on user avatar showing queue depth.
- [ ] Retry-on-reconnect toast on final success / failure.

### Storage quota

- [ ] `navigator.storage.estimate()` — when usage > 80%, prune oldest tile cache entries first, then stale React Query entries.

## Out of scope

- Background sync API (requires HTTPS + user permission; not critical for v1).
- Push notifications.
- Onboarding tour (Phase 8).

## Verification

- Chrome DevTools → Application → Offline checkbox on → reload app → dashboard + last plan load from cache; edits succeed and queue.
- Toggle online again → queue drains, toast appears.
- Reload with fresh cache → service worker serves `/offline` if no network.
- Lighthouse PWA audit ≥ 90.
