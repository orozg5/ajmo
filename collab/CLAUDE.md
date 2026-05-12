# Collab service — conventions

## Role

Hosts the Hocuspocus Yjs WebSocket server. Separate Node/TS process so FastAPI stays request/response.

## Layout

```
collab/
├── src/
│   └── index.ts         Hocuspocus server bootstrap — auth + Postgres + materializer signal + cold-load seed
├── scripts/
│   └── check-db.mjs     Dev helper — verifies plans.yjs_state BYTEA round-trip against the configured DATABASE_URL
├── package.json
├── tsconfig.json
└── .env.example
```

## Responsibilities

- Accept `ws://…?token=<jwt>&planId=<uuid>` connections.
- Call FastAPI `POST /internal/collab/authorize` with the `X-Collab-Secret` header to resolve `{ok, role, userId, planId}` — done in `onAuthenticate`.
- Persist binary Yjs state to `plans.yjs_state` via `@hocuspocus/extension-database` (raw `pg` for direct BYTEA round-trips, not Supabase REST). Clients additionally mirror the same Y.Doc to a per-plan IndexedDB store via `y-indexeddb` (`ajmo:plan:<planId>`); because both sides hold an identical Y.Doc, reconnect uses Hocuspocus's standard state-vector exchange — no special server-side code is required for offline merge.
- POST `/internal/collab/changed` (fire-and-forget, shared-secret-guarded) to FastAPI on `onChange` — triggers the relational materializer.
- Seed cold rooms by calling `GET /internal/collab/seed?plan_id=…` when the `Database` extension's fetch returns `null`.
- Block writes from `role = viewer` connections by returning `{ user, readOnly: true }` from `onAuthenticate` (Hocuspocus drops sync updates server-side based on the connection's `readOnly` flag — `beforeHandleMessage` is not used).

## Hard constraints

- Never write to `plans.yjs_state` from FastAPI — Hocuspocus is the only writer.
- Never trust the client-provided `planId` alone — always verify via the backend authorize call.
- Shared-secret header on every call to `/internal/collab/*` — never allow unauthenticated inbound traffic to those routes.
- No REST endpoints beyond Hocuspocus' own WebSocket — keep this service single-purpose.

## Env vars (all required)

- `HOCUSPOCUS_PORT`
- `DATABASE_URL` — Postgres connection string for the extension
- `BACKEND_AUTHORIZE_URL`, `BACKEND_CHANGED_URL`, `BACKEND_SEED_URL`
- `BACKEND_SHARED_SECRET`
- `YJS_IDLE_MS` — flush-to-postgres idle threshold

## Phase notes

- **Phase 0**: scaffold only — package.json, tsconfig, placeholder index.ts.
- **Phase 6 (shipped 2026-05-06)**: full Hocuspocus wiring, `@hocuspocus/extension-database` + `@hocuspocus/extension-logger`, shared-secret auth dance against FastAPI, viewer `readOnly` gate, change-signal POST, cold-load seed fallback. Awareness/presence shipped same day as part of the social pass (Phase 5) — Hocuspocus's built-in `awareness` channel carries `{user, editing: {kind, id} | null}`; the collab service itself needs no additional code for it (awareness rides the WebSocket alongside the doc updates). Dockerfile still deferred — see `docs/phases/phase-6.md`.
