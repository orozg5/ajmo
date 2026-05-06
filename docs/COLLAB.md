# Collaboration model

## Principle

**Yjs is the source of truth while a plan is open. Relational is the source of truth at rest.** A debounced materializer bridges the two.

## Yjs document shape

Top-level keys on the `Y.Doc`:

- `items: Y.Map<dayId, Y.Array<Y.Map>>` — per-day ordered list of itinerary items. Each item map carries the columns listed in `backend/app/services/collab/schema.py:ITEM_FIELDS` (mirrored in `frontend/src/lib/yjs/schema.ts`).
- `day_notes: Y.Map<dayId, string>` — free-form notes per day.

Out of scope (REST-driven, not in the Y.Doc):

- `plans` row (title, dates, visibility, cover) — managed by `EditPlanDialog`.
- `plan_days` lifecycle (insert/delete) — managed by the date-range sync in `EditPlanDialog`.
- `plan_destinations` and `plan_destination_days` — managed by destination CRUD.
- `plan_hotels` — managed by `useHotels` REST hook.

Hotels and destination changes are not live-synced; collaborators see them on next page reload. Item add/remove/reorder, item-notes, and day notes are the live-collaborative surfaces.

## Reordering

Items use `sort_key text` produced by `fractional-indexing-jittered`:

- New item at end: `generateKeyBetween(lastKey, null)`.
- New item between A and B: `generateKeyBetween(a.sort_key, b.sort_key)`.
- Jitter avoids key collisions under concurrent inserts.

## Hocuspocus auth dance

```
browser                        Hocuspocus                   FastAPI
  │                                │                            │
  │── WS connect w/ token ───────► │                            │
  │                                │── POST /internal/collab/   │
  │                                │   authorize (X-Collab-     │
  │                                │   Secret header) ─────────►│
  │                                │                            │
  │                                │◄─ 200 {role, userId} ──────┤
  │◄─ socket open                  │                            │
  │   (writes blocked for viewer)  │                            │
```

- `/internal/collab/authorize` is shared-secret-guarded (header `X-Collab-Secret` matched via `secrets.compare_digest`).
- Response: `{ ok, role: "owner"|"editor"|"viewer", userId, planId }`.
- Hocuspocus's `onAuthenticate` returns `{ user, readOnly: role === "viewer" }`. The `readOnly` flag drops sync update messages from viewer connections at the server.
- Frontend mirrors this gating: viewer mode hides the Share-as-owner controls, sets the drag-drop activation distance to infinity, and short-circuits item / note mutations in `usePlanItinerary`.

## Persistence

- `@hocuspocus/extension-database` writes the binary Yjs state to `plans.yjs_state` (BYTEA). The store callback uses raw `pg` (not Supabase REST) for direct BYTEA round-trips.
- FastAPI never writes `yjs_state` — it only reads it from the materializer and from `/internal/collab/seed`.

## Materializer

Lives in `backend/app/services/collab/materializer.py`. Per-plan `asyncio.Task` with `YJS_IDLE_MS` debounce (default 30s):

1. Hocuspocus emits `onChange` → POSTs `/internal/collab/changed` (fire-and-forget, shared-secret-guarded).
2. Backend `materializer.schedule(plan_id)` cancels any pending task for that plan and starts a fresh idle timer.
3. When the timer fires:
   - SELECT `yjs_state` from `plans`.
   - `pycrdt.Doc().apply_update(state)` to decode.
   - Read `items` and `day_notes` according to the schema.
   - Reconcile `plan_items` (upsert + delete) scoped by `plan_id`.
   - Update `plan_days.notes` for any day_id that exists in the doc and belongs to this plan.

Days, destinations, and hotels are not touched by the materializer — they're owner-managed via REST.

## Cold load

If `plans.yjs_state IS NULL` when Hocuspocus opens a room:

1. The `Database` extension's `fetch` callback returns `null` from Postgres.
2. Falls back to `GET /internal/collab/seed?plan_id=…` (shared-secret-guarded).
3. Backend builds a fresh `Y.Doc` from `plan_items` and `plan_days.notes` and returns its `get_update()` base64'd.
4. Hocuspocus decodes and uses it as the doc state. Subsequent `store` calls persist back into `yjs_state`.

## Day deletion

The owner deletes a `plan_days` row via REST in `EditPlanDialog`. To prevent the materializer from later trying to upsert items pointing at the now-deleted day:

- `usePlanItinerary.removeDay` calls `clearDayContent(doc, dayId)` first, then the REST DELETE.
- `clearDayContent` removes the day's entry from both `items` and `day_notes` Y.Maps inside a single `Y.transact`.

## Viewer enforcement layers

1. **Server (canonical)**: Hocuspocus `onAuthenticate` returns `readOnly: true`; sync updates are dropped server-side.
2. **Frontend mutations**: `usePlanItinerary` short-circuits add/remove/reorder/notes when `role === "viewer"`.
3. **Frontend UI**: drag-drop's pointer activation distance is set to `Number.POSITIVE_INFINITY` so dragging never starts. A "Viewer" badge in `PlanHeader` signals the mode.
