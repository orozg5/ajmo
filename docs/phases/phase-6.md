# Phase 6 — Real-time collaboration (Yjs + Hocuspocus)

**Exit bar**: two users editing the same plan see each other's changes live (≤500ms); offline edits merge on reconnect; a debounced materializer keeps the relational tables in sync with Yjs state; viewer role cannot write.

## Status

**Shipped 2026-05-06.** Y.Doc roots: `items`, `day_notes`, `plan_meta` (broadcast mirror), plus the social roots added later the same day per ADR "Likes, ratings, comments move into Yjs": `likes`, `ratings`, `comments`. Hotels, destinations, and the `plan_days` lifecycle remain REST-driven. **Awareness shipped 2026-05-06** — per-user `editing: {kind, id}` published from the four free-text surfaces (day notes, item notes, chat, item comments) and rendered by `EditingPresence`; global `PresenceStrip` shows everyone connected in `PlanHeader`. The Dockerfile and Playwright E2E scenarios are still deferred. See `docs/COLLAB.md` for the live contract.

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
- [x] `GET /internal/collab/seed?plan_id=…` — returns base64 `Y.Doc.get_update()` built from `plan_items`, `plan_days.notes`, `plan_item_reactions WHERE kind='like'`, `plan_item_ratings`, and non-deleted `plan_comments`. Used by Hocuspocus for cold load when `yjs_state IS NULL`. (`services/collab/seed.py:build_seed_update_b64`.)

### Materializer

- [x] FastAPI background task, per-plan `asyncio` debounce of `YJS_IDLE_MS` (default 30s) after last `onChange` signal.
- [x] Reads Yjs state from `plans.yjs_state` and decodes with `pycrdt.Doc().apply_update(state)`.
- [x] Reconciles every live-collaborative slice in FK-safe order:
  1. `plan_items` — full upsert+delete scoped by `plan_id`.
  2. `plan_days.notes` — UPDATE for day_ids already on the plan (lifecycle stays REST-driven).
  3. `plan_item_reactions WHERE kind='like'` — insert missing, delete stale (other reaction kinds left untouched as legacy).
  4. `plan_item_ratings` — upsert by (item, user); delete relational rows missing from the doc.
  5. `plan_comments` — upsert by id; delete rows whose id has dropped out of the Y.Array; foreign-plan `plan_item_id` references are sanitised to null.
- `plan_hotels`, `plan_destinations`, and `plan_destination_days` are explicitly **not** touched (REST-driven; see ADR 2026-05-06).

### Frontend

- [x] `frontend/src/lib/yjs/` — doc factory (`schema.ts`), Hocuspocus provider (`provider.ts`), mutations (`mutations.ts`: `addItem`, `removeItem`, `reorderItems`, `setDayNotes`, `updateItemNotes`, `clearDayContent`, `setPlanMeta`, `toggleLike`, `setRating`, `clearRating`, `postComment`, `editComment`, `deleteComment`), React observer hooks (`hooks.ts`: `useYDoc`, `useYAllItems`, `useYAllDayNotes`, `useYPlanMeta`, `useYAllLikes`, `useYAllRatings`, `useYComments`, `useRemoteAwareness`).
- [x] `usePlanItinerary` rewired through Yjs: items + day-notes mutations now write to the Y.Doc; observers fire on remote echoes; viewer mode short-circuits all writes.
- [x] `useDayNotes` and the new `useItemNotes` route through Y.Doc; debounce + REST writes removed.
- [x] `PlanWorkspace.tsx` is the role-aware shell that initializes `useYDoc(planId)`, mounts the `PlanCollabProvider` context (so child components access `{doc, provider, currentUserId, currentUser}` without prop-drilling), and renders the `AwarenessPublisher`.

### Awareness / presence (shipped same day under Phase 5's social pass)

- [x] `AwarenessState = {user, editing: {kind, id} | null}` published via `provider.awareness`. Schema: `lib/yjs/schema.ts`.
- [x] `AwarenessPublisher` sets `user` once profile chrome resolves; clears on unmount.
- [x] `useEditingReporter(kind, id)` is wired on focus/blur of `DayNotesEditor`'s textarea (kind = `day_notes`), `ItemCard`'s expanded notes textarea (`item_notes`), and `CommentsSheet`'s composer (`chat` or `item_comment`).
- [x] `EditingPresence` filters remote awareness by `(kind, id)` and renders an avatar pill next to the matching label.
- [x] `PresenceStrip` in `PlanHeader` shows every connected user, deduped by user-id.
- [x] Hover-presence on items was tried first (early 2026-05-06) and dropped per UX feedback — see ADR for rationale.

### Permissions in UI

- [x] `role === 'viewer'` hides write affordances — drag handles, delete buttons, add/edit menus all keyed on `role`. Drag-drop activation distance is set to `Number.POSITIVE_INFINITY` for viewers so dragging never starts.
- [x] Viewer badge surfaces in `PlanHeader` and the share controls hide for non-owners.

## Out of scope (deferred to a later pass)

- [ ] Cross-tab cursor/selection sharing on the same item (e.g. seeing another user's caret position in the same notes textarea).
- [ ] Soft highlight around an item when another user is editing it (today only the textarea label gets a presence pill).
- [ ] Dockerfile for the collab service (deploy story still pending).
- [ ] Playwright E2E scenarios (the whole `backend/tests/` suite was removed 2026-05-06; an E2E story will land with Phase 9's CI bring-up).

### Always out of scope (handled elsewhere)

- Offline write queue for non-Yjs mutations (Phase 7 — comments, ratings, avatar uploads).
- PWA install / service worker (Phase 7).
- Post-merge conflict UI (CRDT merges are silent by design).

## Verification

- Two browsers editing the same plan: peer A drags an item → peer B sees the new order via `useYAllItems` (Yjs observer) within a tick.
- `plans.yjs_state` is non-null after first edit (`@hocuspocus/extension-database` flushes on idle/close).
- After ~`YJS_IDLE_MS` of quiet, `plan_items`, `plan_days.notes`, `plan_item_reactions`, `plan_item_ratings`, and `plan_comments` reflect the doc state (materializer ran).
- Removing `plans.yjs_state` and re-opening the plan produces the same editable UI **and** the same likes/ratings/comments (cold-load seed via `/internal/collab/seed`).
- Viewer cannot mutate: server-side (Hocuspocus drops writes due to `readOnly`) **and** UI-side (drag-drop blocked, mutations short-circuited in `usePlanItinerary`, like/rating/comment buttons disabled via `usePlanCollab().role`).
- Awareness sanity: A focuses the day-notes textarea → B sees an avatar pill next to "Day notes" within ~100ms; A blurs → pill vanishes. Hovering items in A produces no presence indication in B.
