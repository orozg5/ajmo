# Phase 0 — Foundation reset

**Exit bar**: app builds; theme toggle works; `npm run gen:api` regenerates types; schema v2 + docs exist; collab service scaffolded.

## In scope

- [x] Frontend deps installed: `zod` (direct), `sonner`, `framer-motion`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `yjs`, `y-websocket`, `y-indexeddb`, `y-protocols`, `fractional-indexing-jittered`, `maplibre-gl`, `@tanstack/query-async-storage-persister`, `idb-keyval`, `next-pwa`, `@hey-api/openapi-ts`, `zustand`.
- [x] `collab/` Node service scaffold — `package.json`, `tsconfig.json`, `Dockerfile`, `.env.example`, `src/index.ts` placeholder with `@hocuspocus/server`, `@hocuspocus/extension-database`, `@hocuspocus/extension-logger`, `ws`, `yjs`, `pg`, `undici` deps listed (install + wiring in Phase 6).
- [x] Hardcoded env defaults removed in `backend/app/config.py` for `AI_MODEL`, `OLLAMA_MODEL`, `OLLAMA_BASE_URL`, `AI_PROVIDER_CHAIN`, `FALLBACK_AI_MODEL`. Verified `.env` has each one set.
- [x] `openapi-ts` config (`frontend/openapi-ts.config.ts`) + `npm run gen:api` script — writes TS + Zod + TanStack Query hooks to `frontend/src/lib/api/generated/`.
- [x] Design tokens: rewrote `frontend/src/app/globals.css` with the OKLCH palette from `docs/UI_DESIGN.md` + display-text utilities + reduced-motion fallback.
- [x] Fraunces font wired via `next/font/google` in root layout (`--font-fraunces`).
- [x] `ThemeProvider` (light / dark / system) + toggle in `components/theme/`.
- [x] Layout primitives: `components/layout/AppShell.tsx`, `Header.tsx`, `Sidebar.tsx`, `components/brand/Logo.tsx`.
- [x] `sonner` `<Toaster />` in `providers.tsx` + `useToastStore` Zustand store at `stores/useToastStore.ts`.
- [x] App-level `<ErrorBoundary />` with branded fallback in `components/layout/ErrorBoundary.tsx`, mounted inside Providers.
- [x] Schema v2 — `supabase/schema.sql` rewritten from scratch: `visibility` enum, `plan_days.notes`, `plan_items.sort_key`/`end_time`/`duration_minutes`, `plan_hotels`, `plan_comments`, `plan_item_reactions`, `plan_item_ratings`, `plan_activity`, `plan_invites`, `places.lat`/`lng`/`timezone`/`categories`, hot-path indexes, RLS policies with helper functions.
- [x] Docs skeleton: `PROGRESS.md`, `AUDIT.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `DATA_MODEL.md`, `UI_DESIGN.md`, `COLLAB.md`, `AI_PIPELINE.md`, `OFFLINE.md`, `phases/phase-0.md`..`phases/phase-9.md`.
- [x] Updated `CLAUDE.md` at root, `frontend/CLAUDE.md`, `backend/CLAUDE.md`; new `collab/CLAUDE.md`, `docs/CLAUDE.md`.

## Out of scope

- Any behavior change to existing plans / AI flow.
- Yjs wiring, map rendering, DnD, social — all future phases.
- Visual redesign of dashboards / editor (Phase 2).

## Verification

- `cd frontend && npm run build` succeeds.
- `cd backend && uvicorn main:app --reload` boots; `/openapi.json` reachable.
- `cd frontend && npm run gen:api` produces non-empty `lib/api/generated/`.
- Theme toggle visibly flips light/dark.
- `supabase/schema.sql` applies cleanly on a fresh Supabase project.
