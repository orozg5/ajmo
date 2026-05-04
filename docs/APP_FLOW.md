# App flow — end-to-end user journeys

Five user flows with code pointers at each step. Pair with [`NAVIGATION.md`](NAVIGATION.md) when you need the big-picture folder map.

## 1. Sign in

1. Unauthenticated user hits any path → middleware intercepts → `frontend/src/middleware.ts` (checks Supabase session via `createServerClient`).
2. No session → redirect to `/login` → `frontend/src/app/(auth)/login/page.tsx` renders the route.
3. User submits → `frontend/src/features/auth/components/LoginForm.tsx` calls `supabase.auth.signInWithPassword()` (or OAuth provider).
4. OAuth path: Supabase redirects back with `?code=…` → `frontend/src/app/auth/callback/route.ts` calls `exchangeCodeForSession(code)` and sets the session cookie.
5. Middleware runs again on the post-login request; the session is valid → user lands on their intended page.
6. Dashboard page `frontend/src/app/page.tsx` server-renders with the authenticated Supabase client and fetches initial plans.

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
5. `frontend/src/features/plans/components/itinerary/ItineraryPlanner.tsx` mounts on the client — sets up `usePlanItinerary`, `useDayTransport`, `useCrossCityTransport`, `useHotels`, and `DndContext`.
6. Day-by-day view rendered by `itinerary/DayView.tsx`; sidebar by `itinerary/DaySidebar.tsx`; map panel by `features/map/PlanMap.tsx`.

## 4. Add an item with AI enrichment

1. Inside a day section, user types into `frontend/src/features/plans/components/search/ItemSearch.tsx`.
2. Search hook `frontend/src/features/plans/hooks/useItemEnrichment.ts:30` debounces the query, calls `/ai/autocomplete` (or the places fallback), renders dropdown.
3. User picks a suggestion → hook fires `POST /ai/enrich` → `backend/app/routes/ai.py:49` (`enrich_item_route`) → `app/services/ai/enrichment.py` runs the enrichment LLM + web search + geocoding.
4. Enriched payload (description, price band, hours, photos, location) flows back; `ItemSearch` passes it up to `DayView.tsx` via `onEnrich`.
5. User confirms → `DayView.handleSave` builds an `AddItemPayload` and calls `onAddItem(dayId, payload)` (from `usePlanItinerary`).
6. Hook posts `POST /plans/{id}/items` → `backend/app/routes/plan_items.py` → inserts the row; optimistic update reflects in the UI immediately.
7. Follow-up: `useDayTransport` sees a new within-day pair and refetches transport suggestions for that day (see flow 5).

## 5. Get transport suggestions

1. User clicks "Get transport" on a day (rendered by `frontend/src/features/plans/components/transport/InlineTransportBar.tsx`) **or** opens the cross-city panel (`transport/CrossCityTransportPanel.tsx`).
2. Hook fires the request: `useDayTransport` → `POST /ai/transport-suggestions/day`, or `useCrossCityTransport` → `POST /ai/transport-suggestions/cross-city`.
3. Backend route `backend/app/routes/ai.py:210` / `:234` delegates to `backend/app/services/ai/transport.py` (`get_same_day_suggestions` / `get_cross_city_suggestions`).
4. Cache check: `transport.py` reads `ai_attraction_cache`-style full-cache key via `read_full_cache()`. Hit → return immediately.
5. Miss → build pair graph via `backend/app/services/ai/transport_pairs.py` (`build_same_day_pairs` / `build_cross_city_pairs`, `resolve_item_location`).
6. LLM call + assembly via `backend/app/services/ai/transport_llm.py` (`build_transport_prompt`, `call_llm_for_transport`, `assemble_suggestions`). Structured output typed by `services/ai/schemas.py` (`TransportResponse` of `LlmTransportOption`).
7. Cache the full response (`write_full_cache`) and return `TransportSuggestion[]` to the frontend.
8. Frontend renders options inside `InlineTransportBar` / `CrossCityTransportPanel`. Clicking an option calls `onAddTransportOption` → `POST /plans/{id}/items` with `item_type: "transport"`. The new item is paired back to its source via `ai_data.same_day_pair` / `cross_city_pair`.
