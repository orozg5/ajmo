# App flow — end-to-end user journeys

Five user flows with code pointers at each step. Pair with [`NAVIGATION.md`](NAVIGATION.md) when you need the big-picture folder map.

## 1. Sign in

1. Unauthenticated user hits any path → middleware intercepts → `frontend/src/middleware.ts` (checks Supabase session via `createServerClient`).
2. No session → redirect to `/login` → `frontend/src/app/(auth)/login/page.tsx` renders the route.
3. User submits → `frontend/src/features/auth/components/LoginForm.tsx` calls `supabase.auth.signInWithPassword()` (or OAuth provider).
4. OAuth path: Supabase redirects back with `?code=…` → `frontend/src/app/auth/callback/route.ts` calls `exchangeCodeForSession(code)` and sets the session cookie.
5. Middleware runs again on the post-login request; the session is valid → user lands on their intended page.
6. Dashboard page `frontend/src/app/page.tsx` server-renders with the authenticated Supabase client, fetches `listPlans()` for owner/member/public scopes in parallel, and fetches the greeting profile via `lib/supabase/profile.ts`. It then mounts `features/plans/components/dashboard/DashboardSections.tsx`, which composes `HomeHero` (greeting + trip stats banner) and `TripsExplorer` (tabbed scope filter over `PlanCard` + `TripStatusPill`, driven by `usePlanFilters` and `useDashboardPlans`).

## 2. Create a plan

1. User clicks "New plan" on the dashboard (`frontend/src/features/plans/components/dashboard/DashboardSections.tsx`) → `Link href="/plans/new"`.
2. Wizard mounts at `frontend/src/app/plans/new/page.tsx` → `frontend/src/features/plans/components/wizard/CreatePlanWizard.tsx`.
3. User walks through steps: `StepTitleDates.tsx` → `StepDestinations.tsx` → `StepCoverImage.tsx` → `StepReview.tsx`. Form state managed by React Hook Form + Zod (`wizard/schema.ts`).
4. On submit: `CreatePlanWizard.tsx` calls `createPlan()` from `@/lib/api` → `POST /plans`.
5. Backend route `backend/app/routes/plans.py:23` (`create_plan_route`) → validates body via `app/schemas/plans.py` → inserts via `app/services/plans/` + Supabase service client.
6. On success: wizard also calls `createDestination()` per destination, then `router.push('/plans/{id}')` (`CreatePlanWizard.tsx:122`).

## 3. Open a plan

1. User navigates to `/plans/{id}` → Next.js server component `frontend/src/app/plans/[id]/page.tsx` runs.
2. Server component resolves the session via `@/lib/supabase/server`, then fires three parallel fetches: `getPlan()`, `initializeDays()`, `getDestinations()` (all in `@/lib/api`, routed via FastAPI).
3. Backend: `backend/app/routes/plans.py`, `plan_days.py`, `plan_destinations.py` query Postgres (RLS enforced on the anon path; service-role for backend-owned tables).
4. Server component renders `<PlanHeader>` + `<ItineraryPlanner>` with SSR data.
5. `frontend/src/features/plans/components/itinerary/ItineraryPlanner.tsx` mounts on the client — sets up `usePlanItinerary`, `useCrossCityTransport`, `useHotels`, `DndContext`, and the `DragOverlayCard`. Same-day transport is per-pair (no plan-wide hook): `InlineTransportBar` → `useSameDayTransportOptions` + `useSameDayTransportInsert`.
6. Day-by-day view rendered by `itinerary/DayView.tsx`; day navigation by `itinerary/DayTabs.tsx` (DnD-droppable chips, replaces the legacy DaySidebar); map panel by `features/map/PlanMap.tsx`. `PlanHeader` opens `EditPlanDialog` (General / Destinations / Danger tabs split across `EditPlanGeneralTab`, `EditPlanDestinationsTab`, `EditPlanDangerTab`) and `DeletePlanDialog`.

## 4. Add an item with AI enrichment

1. Inside a day section, user types into `frontend/src/features/plans/components/search/ItemSearch.tsx`.
2. Search hook `frontend/src/features/plans/hooks/useItemEnrichment.ts:30` debounces the query, calls `/ai/autocomplete` (or the places fallback), renders dropdown.
3. User picks a suggestion → hook fires `POST /ai/enrich` → `backend/app/routes/ai.py:49` (`enrich_item_route`) → `app/services/ai/enrichment.py` runs the enrichment LLM + web search + geocoding.
4. Enriched payload (description, price band, hours, photos, location) flows back; `ItemSearch` passes it up to `DayView.tsx` via `onEnrich`.
5. User confirms → `DayView.handleSave` builds an `AddItemPayload` and calls `onAddItem(dayId, payload)` (from `usePlanItinerary`).
6. Hook posts `POST /plans/{id}/items` → `backend/app/routes/plan_items.py` → inserts the row; optimistic update reflects in the UI immediately.
7. Follow-up: same-day transport is no longer auto-refetched. The `InlineTransportBar` between adjacent items is the user's explicit entry point — when expanded, `useSameDayTransportOptions` fans out OSRM (walk/bike/drive) and Transitous (transit) calls for that pair; `useSameDayTransportInsert` writes the chosen mode as a transport plan item with `ai_data.same_day_pair`.

## 5. Get transport suggestions (no LLM, ADR 2026-05-06)

### Same-day (within a day, frontend-driven)

1. User expands `frontend/src/features/plans/components/transport/InlineTransportBar.tsx` between two adjacent items.
2. `useSameDayTransportOptions` fans out four parallel calls:
   - `POST /transit/osrm-route` × {`foot`, `bike`, `driving`} — `backend/app/routes/transit.py:transit_osrm_route_route` → `services/transport/osrm.py:get_route`.
   - `POST /transit/directions` — `backend/app/routes/transit.py:transit_directions_route` → `services/transit/directions.py:get_transit_directions` (Transitous MOTIS).
   Each endpoint returns 204 when no route exists, and the corresponding mode button is hidden.
3. User picks a mode → `useSameDayTransportInsert` calls `addPlanItem` with `item_type: "transport"` and `ai_data: { same_day_pair, mode, distance_meters, duration_seconds, transit_summary?, geometry? }`.

### Cross-city (backend-orchestrated, streamed)

1. User opens `transport/CrossCityTransportPanel.tsx`.
2. `useCrossCityTransport` opens an SSE stream to `GET /ai/transport-suggestions/stream?plan_id=…` (`backend/app/routes/ai.py:transport_stream_route`).
3. Backend builds the cross-city pair graph via `services/ai/transport_pairs.py` (`build_cross_city_pairs`), reads `plans.transport_suggestions["cross_city"]` for cached hits, and streams cached pairs first.
4. For uncovered pairs, `services/transport/cross_city.py:stream_options_for_pairs` resolves source/destination coords (geocoding sentinel cities through Nominatim when needed) and fans out per pair, in parallel:
   - `OSRM` driving (skipped when haversine > 1500 km)
   - `Transitous` train (RAIL family), bus (BUS / COACH; skipped > 1500 km), ferry
   - `flight_estimator` haversine + cruise estimate (skipped < 200 km)
5. Each pair streams back as an `event: pair` frame containing `options[]` of `{ mode, name, duration_seconds, distance_meters, is_estimate, transit_summary?, geometry? }`. Backend persists the merged result back into `plans.transport_suggestions["cross_city"]`.
6. Frontend renders options in `CrossCityTransportPanel`. Selecting one calls `addPlanItem` with `item_type: "transport"` and `ai_data.cross_city_pair = "{src}->{dst}"` so subsequent fetches skip covered pairs.
