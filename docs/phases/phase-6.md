# Phase 6 — Real-time collaboration (Yjs + Hocuspocus)

**Exit bar**: two users editing the same plan see each other's changes live (≤500ms); offline edits merge on reconnect; a debounced materializer keeps the relational tables in sync with Yjs state; viewer role cannot write.

## Status

**Shipped 2026-05-06.** Y.Doc scoped to `items` + `day_notes` only per ADR 2026-05-06; hotels, destinations, and the `plan_days` lifecycle stay REST-driven. Presence/awareness UI (cursors, colors, typing indicators), the Dockerfile, and the Playwright E2E scenarios were deferred. See `docs/COLLAB.md` for the live contract.

## In scope (shipped)

### Collab service (`collab/`)

- [x] Hocuspocus server with:
  - [x] `@hocuspocus/extension-database` → Postgres persistence to `plans.yjs_state` (raw `pg`-backed callbacks for BYTEA round-trip).
  - [x] `@hocuspocus/extension-logger` (dev).
  - [x] Custom auth extension: on connect, POST JWT + `planId` to FastAPI `/internal/collab/authorize` with shared-secret header `X-Collab-Secret`; response `{ok, role, userId, planId}`. Reject on 403.
  - [x] Viewer write-gate: `onAuthenticate` returns `{ user, readOnly: role === "viewer" }` so Hocuspocus drops sync updates from viewer connections server-side. (`beforeHandleMessage` was the original plan; the implementation uses the `readOnly` connection flag, which is the documented Hocuspocus way.)
- [x] Env vars wired: `HOCUSPOCUS_PORT`, `DATABASE_URL`, `BACKEND_AUTHORIZE_URL`, `BACKEND_CHANGED_URL`, `BACKEND_SEED_URL`, `BACKEND_SHARED_SECRET`, `YJS_IDLE_MS=30000` (see `collab/.env.example`).

### Backend — collab endpoints

- [x] `POST /internal/collab/authorize` — shared-secret-guarded (`X-Collab-Secret`, `secrets.compare_digest`). Resolves JWT → `(user_id, role)` given plan ownership + `plan_members` membership. Returns `{ok, role, userId, planId}`. (`backend/app/routes/collab.py` + `services/collab/authorize.py`.)
- [x] `POST /internal/collab/changed` — Hocuspocus fires this on `onChange`; schedules the per-plan materializer debounce. (`services/collab/materializer.py:schedule`.)
- [x] `GET /internal/collab/seed?plan_id=…` — returns base64 `Y.Doc.get_update()` built from `plan_items` + `plan_days.notes`, used by Hocuspocus for cold load when `yjs_state IS NULL`. (`services/collab/seed.py:build_seed_update_b64`.)

### Materializer

- [x] FastAPI background task, per-plan `asyncio` debounce of `YJS_IDLE_MS` (default 30s) after last `onChange` signal.
- [x] Reads Yjs state from `plans.yjs_state` and decodes with `pycrdt.Doc().apply_update(state)`.
- [x] Reconciles only the live-collaborative slices: full upsert+delete on `plan_items` (scoped by `plan_id`) and `UPDATE plan_days.notes` for day_ids that already exist on this plan. `plan_hotels`, `plan_destinations`, and `plan_destination_days` are explicitly **not** touched (REST-driven; see ADR 2026-05-06).

### Frontend

- [x] `frontend/src/lib/yjs/` — doc factory (`schema.ts`), Hocuspocus provider (`provider.ts`), mutations (`mutations.ts`: `addItem`, `removeItem`, `reorderItems`, `setDayNotes`, `updateItemNotes`, `clearDayContent`, `setPlanMeta`), React observer hooks (`hooks.ts`: `useYDoc`, `useYAllItems`, `useYAllDayNotes`, `useYPlanMeta`).
- [x] `usePlanItinerary` rewired through Yjs: items + day-notes mutations now write to the Y.Doc; observers fire on remote echoes; viewer mode short-circuits all writes.
- [x] `useDayNotes` and the new `useItemNotes` route through Y.Doc; debounce + REST writes removed.
- [x] `PlanWorkspace.tsx` (new) is the role-aware shell that initializes `useYDoc(planId)`, threads `role` + `doc` + `liveMeta` into `PlanHeader` and `ItineraryPlanner`.

### Permissions in UI

- [x] `role === 'viewer'` hides write affordances — drag handles, delete buttons, add/edit menus all keyed on `role`. Drag-drop activation distance is set to `Number.POSITIVE_INFINITY` for viewers so dragging never starts.
- [x] Viewer badge surfaces in `PlanHeader` and the share controls hide for non-owners.

## Out of scope (deferred to a later pass)

- [ ] Awareness state (cursor day/item/field, color from profile hash, name, avatar, `isTyping`, `lastActive`).
- [ ] Presence UI: avatar stack in `PlanHeader`, `isTyping` indicator in day/item notes, soft highlight around an item when another user's cursor is on it.
- [ ] Dockerfile for the collab service (deploy story still pending).
- [ ] Playwright E2E scenarios (the whole `backend/tests/` suite was removed 2026-05-06; an E2E story will land with Phase 9's CI bring-up).

### Always out of scope (handled elsewhere)

- Offline write queue for non-Yjs mutations (Phase 7 — comments, ratings, avatar uploads).
- PWA install / service worker (Phase 7).
- Post-merge conflict UI (CRDT merges are silent by design).

## Verification

- Two browsers editing the same plan: peer A drags an item → peer B sees the new order via `useYAllItems` (Yjs observer) within a tick.
- `plans.yjs_state` is non-null after first edit (`@hocuspocus/extension-database` flushes on idle/close).
- After ~`YJS_IDLE_MS` of quiet, `plan_items` + `plan_days.notes` reflect the doc state (materializer ran).
- Removing `plans.yjs_state` and re-opening the plan produces the same editable UI (cold-load seed via `/internal/collab/seed`).
- Viewer cannot mutate: server-side (Hocuspocus drops writes due to `readOnly`) **and** UI-side (drag-drop blocked, mutations short-circuited in `usePlanItinerary`).
