# Collaboration model

## Principle

**Yjs is the source of truth while a plan is open. Relational is the source of truth at rest.** A debounced materializer bridges the two.

## Yjs document shape

Top-level `Y.Map` called `plan` with keys:

- `meta: Y.Map` — `{ title, description, cover_image_path, date_from, date_to, visibility }`.
- `destinations: Y.Map<destinationId, Y.Map>` — `{ id, country, city, sort_order, day_numbers: Y.Array<number> }`.
- `days: Y.Array<Y.Map>` — ordered. Each `{ id, day_number, date, title, notes: Y.Text, item_ids: Y.Array<string> }`.
- `items: Y.Map<itemId, Y.Map>` — each `{ id, plan_id, day_id, destination_id, item_type, title, notes, location, lat, lng, start_time, end_time, sort_key, ai_data: Y.Map }`.
- `hotels: Y.Map<hotelId, Y.Map>` — `{ id, place_id, destination_id, check_in_day_number, check_out_day_number, check_in_time, check_out_time, notes, sort_key }`.

## Awareness channel

Per-user state: `{ userId, name, color, avatar_url, cursor: { dayId?, itemId?, fieldName? }, isTyping: bool, lastActive: number }`.

## Reordering

All ordering via `sort_key text` generated with `fractional-indexing-jittered`:

- New item at end: `generateKeyBetween(lastKey, null)`.
- New item between A and B: `generateKeyBetween(a.sort_key, b.sort_key)`.
- Jitter avoids key collisions under concurrent inserts.

## Hocuspocus auth dance

```
browser                                 Hocuspocus                FastAPI
  │                                          │                      │
  │── WS connect w/ ?token=<jwt> ──────────► │                      │
  │                                          │── POST /internal/    │
  │                                          │   collab/authorize ──►
  │                                          │                      │
  │                                          │◄─ 200 {role} ────────┤
  │◄─ socket open if role in (editor,owner)─ │                      │
  │                       or readonly if viewer
```

- `/internal/collab/authorize` is service-role-protected (shared secret header).
- Response: `{ ok: true, role: "owner"|"editor"|"viewer", userId, planId }`.
- Hocuspocus blocks writes server-side for `role = viewer`.
- Invite-link anonymous access: `?invite=<token>` resolves via `plan_invites` to `{ role, plan_id }` and authorizes.

## Persistence

- **Hocuspocus Postgres extension** flushes binary Yjs state to `plans.yjs_state` on:
  - Document idle (30s).
  - Every 30s during active editing.
  - Room close.
- No FastAPI write path to `yjs_state` — only Hocuspocus.

## Materializer

FastAPI background task, per-plan debounce 2-5s after last edit signal:

1. Read current Yjs state from `plans.yjs_state` (or from in-memory doc if subscribed).
2. Diff against relational (plan_days, plan_items, plan_hotels, plan_destinations, plan_destination_days).
3. Upsert changed rows; delete removed rows.
4. Log an entry to `plan_activity` per materialized change kind.

Signal sources: Hocuspocus emits `onChange` → POST to `/internal/collab/changed` → task scheduled.

## Cold load

If `plans.yjs_state IS NULL`:

1. FastAPI `/internal/collab/seed` reads relational rows.
2. Builds the Yjs doc in memory.
3. Returns base64-encoded `Y.Doc.toUpdate()` to Hocuspocus.
4. Hocuspocus applies + persists, then serves to first connecting client.

## Offline merge

- `y-indexeddb` persists the doc locally; edits survive reload.
- On reconnect, `y-websocket` exchanges vector clocks with Hocuspocus.
- CRDT merges deterministically. Users see converged state within a tick.

## Viewer restriction

- Viewer role: Hocuspocus `beforeHandleMessage` rejects `MESSAGE_SYNC_UPDATE` from viewer clients (return 403).
- Frontend hides editing affordances when `role === 'viewer'`, but never relies on the UI as the permission boundary.
