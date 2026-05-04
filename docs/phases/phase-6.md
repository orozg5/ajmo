# Phase 6 — Real-time collaboration (Yjs + Hocuspocus)

**Exit bar**: two users editing the same plan see each other's cursors and changes live (≤500ms); offline edits merge on reconnect; a debounced materializer keeps the relational tables in sync with Yjs state; viewer role cannot write.

## In scope

### Collab service (`collab/`)

- [ ] Hocuspocus server with:
  - [ ] `@hocuspocus/extension-database` → Postgres persistence to `plans.yjs_state`.
  - [ ] `@hocuspocus/extension-logger` (dev).
  - [ ] Custom auth extension: on connect, POST JWT + `?planId=` to FastAPI `/internal/collab/authorize` with shared secret; response `{ok, role, userId, planId}`. Reject on 403.
  - [ ] Viewer write-gate: `beforeHandleMessage` rejects sync updates from clients whose stored connection role is `viewer`.
- [ ] Dockerfile for the collab service.
- [ ] Env vars wired: `DATABASE_URL`, `HOCUSPOCUS_PORT`, `BACKEND_AUTHORIZE_URL`, `BACKEND_SHARED_SECRET`, `YJS_IDLE_MS=30000`.

### Backend — collab endpoints

- [ ] `POST /internal/collab/authorize` — service-role-protected (shared secret header). Resolves JWT → `(user_id, role)` given plan visibility + membership + invite token. Returns `{ok, role, userId, planId}`.
- [ ] `POST /internal/collab/changed` — Hocuspocus fires this on `onChange`; schedules the materializer debounce.
- [ ] `GET /internal/collab/seed?plan_id=…` — returns base64 `Y.Doc.toUpdate()` built from relational, used by Hocuspocus for cold load when `yjs_state IS NULL`.

### Materializer

- [ ] FastAPI background task, per-plan debounce 2-5s after last edit.
- [ ] Reads Yjs state from `plans.yjs_state` (or in-memory doc if subscribed to a Hocuspocus read replica).
- [ ] Diffs against relational: `plan_days`, `plan_items`, `plan_hotels`, `plan_destinations`, `plan_destination_days`.
- [ ] Upserts changed rows, deletes removed rows.
- [ ] Appends one `plan_activity` entry per materialized change kind.

### Frontend

- [ ] `frontend/src/lib/yjs/` — doc factory, providers (`y-websocket` + `y-indexeddb` layered), React hooks.
- [ ] Replace `usePlanItinerary` data shape with Yjs-backed hooks: `useYDoc(planId)`, `useYItems(dayId)`, `useYMutations()`.
- [ ] Keep the same TypeScript types emitted from the generated client, but read/write via the Yjs doc.
- [ ] Awareness: cursor (day + item + field), color (from user profile hash), name, avatar, `isTyping`, `lastActive`.
- [ ] Presence UI: avatar stack in `PlanHeader`; `isTyping` indicator in day-notes and item-notes; soft highlight around an item when another user's cursor is on it.

### Permissions in UI

- [ ] `role === 'viewer'` hides write affordances (drag handles, delete buttons, add/edit menus, notes become read-only).
- [ ] Viewer badge in header.

### E2E scenario (Playwright)

- [ ] Two browsers join the same plan → both see each other's cursor within 500ms.
- [ ] Browser A goes offline → edits an item → reconnects → browser B sees the change within 500ms of reconnect.
- [ ] Viewer in browser C opens the plan → cannot drag items (UI blocked + server-side blocked via `beforeHandleMessage`).

## Out of scope

- Offline write queue for non-Yjs mutations (Phase 7 — comments, ratings, avatar uploads).
- PWA install / service worker (Phase 7).
- Post-merge conflict UI (CRDT merges are silent by design).

## Verification

- See E2E scenario above.
- `plans.yjs_state` is non-null after first edit.
- `plan_activity` gets appended entries after materializer runs.
- Removing `plans.yjs_state` and re-opening the plan produces the same editable UI (cold-load seed works).
