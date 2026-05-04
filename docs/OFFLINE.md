# Offline + PWA

## Persistence providers

### Yjs (collaborative state)

- Stack: `y-indexeddb` provider + `y-websocket` provider on the same `Y.Doc`.
- Edits commit to IndexedDB synchronously before WebSocket ack.
- Reconnect: vector-clock exchange merges local ops into the shared doc.

### React Query (REST state)

- `@tanstack/query-async-storage-persister` with `idb-keyval` as the IndexedDB adapter.
- Mutation queue: `onlineManager` retries failed mutations on reconnect.
- Selective persistence: only queries tagged `{ persist: true }` are rehydrated (e.g. plan lists, comments). Transient queries (autocomplete, SSE token streams) skip persistence.

### Write queue (non-Yjs)

Comments, ratings, reactions, avatar uploads when offline:
- Queue entry: `{ id, endpoint, method, payload, attemptedAt, retries }`.
- Stored in IndexedDB via `idb-keyval`.
- Drained by a background sync on reconnect, with exponential backoff.

## Service worker (`next-pwa`)

Strategies by route:

| Pattern                                    | Strategy                               |
|--------------------------------------------|----------------------------------------|
| App shell (`/`, `/plans`, `/plans/[id]`)   | Cache-first, update in background      |
| `_next/static/*`                           | Cache-first, immutable                 |
| `/api/*` (backend proxied)                 | Network-first, stale-while-revalidate  |
| MapLibre tile URLs (`*.tile.openstreetmap.org` etc.) | LRU cache, 50 MB cap, 7-day max age |
| Supabase Storage (covers, avatars)         | Cache-first, 1-day max age             |
| Supabase Auth (`/auth/v1/*`)               | Network-only (no caching)              |

Offline fallback route: `/offline` — minimal shell + "you're offline" message + cached plan links.

## UI affordances

- **Offline pill** in header (Zustand store): `isOnline: navigator.onLine + navigator.connection.effectiveType`.
- **Queued mutations indicator**: badge on avatar showing queue depth.
- **Retry-on-reconnect**: automatic; user sees a toast on final success / failure.

## Reconnect semantics

1. `online` event fires → `onlineManager.setOnline(true)`.
2. y-websocket reconnects; CRDT merges.
3. React Query retries all queued mutations in order.
4. Any failed mutation after 5 retries is moved to a "needs attention" list surfaced in the UI.

## Cache eviction

- Browser storage quota handled via `navigator.storage.estimate()` — when usage > 80%, prune oldest tile cache entries first, then stale React Query entries.

## Install prompt

- Next-PWA manifest with short_name, theme_color matching `--primary`, icons at 192/512.
- Custom install button in dashboard footer when `beforeinstallprompt` fires.
