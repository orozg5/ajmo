# Map of the codebase

Start here when you don't know where a file lives. For deeper conventions, each top-level folder has its own `CLAUDE.md`.

## Where do I look if I need to…

| Task | Path |
| --- | --- |
| add a new backend REST route | `backend/app/routes/<resource>.py` (follow the `supabase-service-pattern` used by existing route files) |
| register a new FastAPI router | `backend/main.py` |
| add a request/response schema | `backend/app/schemas/<resource>.py` |
| change how a plan item renders | `frontend/src/features/plans/components/itinerary/ItemCard.tsx` |
| tune an AI prompt (enrichment) | `backend/app/services/ai/enrichment.py` |
| tune an AI prompt (transport) | `backend/app/services/ai/transport_llm.py` |
| change LLM provider chain or retry logic | `backend/app/services/ai/llm.py` + `backend/app/config.py` |
| change the LLM structured-output schemas | `backend/app/services/ai/schemas.py` |
| edit the places/autocomplete cache | `backend/app/services/places/` |
| adjust the itinerary drag-and-drop logic | `frontend/src/features/plans/utils/dragEndToReorderEntry.ts` + `components/itinerary/ItineraryPlanner.tsx` |
| add a new top-level page | `frontend/src/app/<route>/page.tsx` |
| change the auth/middleware redirects | `frontend/src/middleware.ts` |
| change the Supabase server client | `frontend/src/lib/supabase/server.ts` |
| add or edit a shared Shadcn primitive | `frontend/src/components/ui/` |
| add a style token (color, radius, font) | `frontend/src/app/globals.css` |
| add a new plans-feature hook | `frontend/src/features/plans/hooks/use<Name>.ts` |
| regenerate the typed API client | `cd frontend && npm run gen:api` (writes to `src/lib/api/generated/`) |
| change the DB schema | `supabase/schema.sql` (single source of truth) |
| document an architectural decision | `docs/DECISIONS.md` (ADR-style entry) |
| track a phase's scope/progress | `docs/phases/phase-N.md` + update `PROGRESS.md` |

## Top-level folders

- **`frontend/`** — Next.js 15 App Router + Tailwind + Shadcn. See `frontend/CLAUDE.md` for directory layout, state layering, auth pattern, and hard constraints.
- **`backend/`** — FastAPI + Pydantic. All AI/RAG pipelines live here. See `backend/CLAUDE.md` for the route/service/schema split and structured-output rules.
- **`collab/`** — Hocuspocus Yjs WebSocket server. Wired up in Phase 6. See `collab/CLAUDE.md`.
- **`supabase/`** — DB schema and RLS policies. `schema.sql` is the source of truth.
- **`docs/`** — Audit, ADRs, per-phase plans, this file, `APP_FLOW.md`. See `docs/CLAUDE.md` for style rules.

## Backend subfolder quick reference

- **`app/routes/`** — one file per resource (`plans.py`, `plan_items.py`, `ai.py`, `places.py`, `storage.py`, `users.py`, …). Thin; delegates to `services/`.
- **`app/schemas/`** — Pydantic HTTP contracts. Note: `schemas/ai.py` is the HTTP side; `services/ai/schemas.py` is the LLM-side (structured-output) schemas — they are distinct by design.
- **`app/services/ai/`** — LLM pipeline. `llm.py` (provider chain), `enrichment.py` (item enrichment), `transport.py` (orchestrators + cache) → `transport_pairs.py` (pair graph) + `transport_llm.py` (prompt + call + assembly).
- **`app/services/places/`** — places cache, geocoding, country codes, repository.
- **`app/services/plans/`** — hotels, destinations, day materialization.
- **`app/services/users/`** — user profile helpers.
- **`app/services/storage/`** — Supabase Storage helpers (covers, avatars).
- **`app/auth.py`**, **`app/db.py`**, **`app/config.py`**, **`app/constants.py`** — cross-cutting (JWT verification, Supabase service client factory, settings, shared constants).

## Frontend subfolder quick reference

- **`src/app/`** — routes only. `page.tsx` at root is the dashboard; `plans/[id]/page.tsx` is the itinerary editor; `plans/new/` is the wizard; `(auth)/` is the unauthenticated route group; `auth/callback/route.ts` is the OAuth handler.
- **`src/components/ui/`** — Shadcn primitives only, never feature code.
- **`src/components/layout/`** — `AppShell`, `Header`, `Sidebar`, `ErrorBoundary`.
- **`src/features/plans/components/`** — organized by concern: `dashboard/`, `itinerary/`, `search/`, `transport/`, `hotels/`, `wizard/`. See `src/features/plans/README.md`.
- **`src/features/plans/hooks/`** — data-fetching hooks (`usePlanItinerary`, `useDayTransport`, `useCrossCityTransport`, `useHotels`, `useAiSuggestions`, `useItemEnrichment`, `useDayNotes`, `useDashboardPlans`, `useCoverUpload`, `useDestinations`).
- **`src/features/plans/utils/`** — pure helpers shared across the feature (`sortKeys`, `visibility`, `itemType`, `fieldLabels`, `crossCityPayload`, `dragEndToReorderEntry`, `transportPairs`).
- **`src/features/auth/components/`** — `LoginForm`, `RegisterForm`, `LogoutButton`.
- **`src/features/map/`** — MapLibre components + style helpers (Phase 4).
- **`src/features/settings/components/`** — `PreferencesForm`, `ProfileForm`.
- **`src/lib/api/`** — runtime fetch wrapper (`client.ts`) + generated SDK (`generated/`) + one-time setup (`generatedSetup.ts`).
- **`src/lib/supabase/`** — `client.ts` (browser) and `server.ts` (SSR).
- **`src/lib/map/`** — MapLibre init, style, marker helpers.
- **`src/stores/`** — Zustand stores (UI state only — theme, toasts, dialogs).

## Where data lives

| Concern | Where |
| --- | --- |
| Live itinerary state (while a plan is open) | Yjs Y.Doc via Hocuspocus (Phase 6) |
| Itinerary state at rest | `plans`, `plan_days`, `plan_items`, `plan_destinations`, `plan_hotels` (Postgres, via Supabase) |
| Permanent places cache (autocomplete + geocoding) | `places` table (backend-only, service role) |
| 24h volatile AI attraction cache | `ai_attraction_cache` (backend-only) |
| Slug alias resolution | `slug_aliases` (backend-only) |
| Auth sessions | Supabase Auth; cookies set by `middleware.ts` + `auth/callback/route.ts` |
| UI state (toasts, theme, dialogs) | Zustand — `frontend/src/stores/` |
| Server cache (browser side) | React Query; persisted subset in IndexedDB (Phase 7) |
| Uploaded covers / avatars | Supabase Storage buckets |

## Related docs

- [`APP_FLOW.md`](APP_FLOW.md) — end-to-end user flows with code pointers.
- [`AI_PIPELINE.md`](AI_PIPELINE.md) — provider routing, structured-output schemas, cache layers.
- [`DATA_MODEL.md`](DATA_MODEL.md) — table-by-table reference.
- [`DECISIONS.md`](DECISIONS.md) — ADR log.
- [`AUDIT.md`](AUDIT.md) — standing critique of the current code.
