# Collab service — conventions

## Role

Hosts the Hocuspocus Yjs WebSocket server. Separate Node/TS process so FastAPI stays request/response.

## Layout

```
collab/
├── src/
│   └── index.ts         Hocuspocus server bootstrap (Phase 6: auth + Postgres + materializer signal)
├── package.json
├── tsconfig.json
├── Dockerfile
└── .env.example
```

## Responsibilities

- Accept `ws://…?token=<jwt>&planId=<uuid>` connections.
- Call FastAPI `/internal/collab/authorize` with a shared secret to resolve `{ok, role, userId, planId}`.
- Persist binary Yjs state to `plans.yjs_state` via `@hocuspocus/extension-database`.
- POST `/internal/collab/changed` to FastAPI on `onChange` — triggers the relational materializer.
- Seed cold rooms by calling `/internal/collab/seed?plan_id=…` when `yjs_state IS NULL`.
- Reject `SYNC_UPDATE` messages from `role = viewer` in `beforeHandleMessage`.

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

- **Phase 0**: scaffold only — package.json, tsconfig, Dockerfile, placeholder index.ts.
- **Phase 6**: full Hocuspocus wiring, extensions, auth dance, persistence, change signal.
