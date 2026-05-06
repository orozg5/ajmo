# App flow — end-to-end user journeys

End-to-end user flows with code pointers at each step. Pair with [`NAVIGATION.md`](NAVIGATION.md) when you need the big-picture folder map and [`COLLAB.md`](COLLAB.md) for the Yjs/Hocuspocus contract.

## 1. Sign in

1. Unauthenticated user hits any path → middleware intercepts → `frontend/src/middleware.ts` (checks Supabase session via `createServerClient`).
2. No session → redirect to `/login?next=<original_path>` so the requested URL is preserved → `frontend/src/app/(auth)/login/page.tsx` renders the route.
3. User submits → `frontend/src/features/auth/components/LoginForm.tsx` calls `supabase.auth.signInWithPassword()` (or OAuth provider). On the OAuth path, the form forwards `?next` into the redirect URL so the callback can hop back to it.
4. OAuth path: Supabase redirects back with `?code=…` → `frontend/src/app/auth/callback/route.ts` calls `exchangeCodeForSession(code)` and sets the session cookie, then redirects to `next` (or `/` if absent).
5. Middleware runs again on the post-login request; the session is valid → user lands on their intended page (this is what makes the invite-link flow in #8 work end-to-end).
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
2. Server component resolves the session via `@/lib/supabase/server`, then fires four parallel fetches: `getPlan()`, `initializeDays()`, `getDestinations()`, and `getMyPlanRole()` (all in `@/lib/api`, routed via FastAPI).
3. Backend: `backend/app/routes/plans.py`, `plan_days.py`, `plan_destinations.py`, and `routes/social.py` (`/plans/{id}/role`) query Postgres. Role resolution lives in `services/social/members.py:get_role` (owner via `plans.owner_id`, otherwise `plan_members.role`).
4. Server component renders `<PlanWorkspace>` (`frontend/src/features/plans/components/itinerary/PlanWorkspace.tsx`) wrapping `<PlanHeader>` + `<ItineraryPlanner>` with SSR data + the resolved `role`.
5. `PlanWorkspace` mounts on the client — calls `useYDoc(planId)` (`frontend/src/lib/yjs/hooks.ts`) which boots the Hocuspocus provider with the user's Supabase JWT + plan id. `useYPlanMeta(doc)` exposes the broadcast plan-meta mirror so peer renames/date-shifts arrive live.
6. `ItineraryPlanner` then sets up `usePlanItinerary` (now driven by `useYAllItems` + `useYAllDayNotes` observers — Y.Doc is the source of truth while open), plus `useCrossCityTransport`, `useHotels`, `DndContext` (drag activation distance jumps to infinity for viewers), and the `DragOverlayCard`. Same-day transport is per-pair: `InlineTransportBar` → `useSameDayTransportOptions` + `useSameDayTransportInsert`.
7. Day-by-day view rendered by `itinerary/DayView.tsx`; day navigation by `itinerary/DayTabs.tsx` (DnD-droppable chips, replaces the legacy DaySidebar); map panel by `features/map/PlanMap.tsx`. `PlanHeader` opens `EditPlanDialog` (General / Destinations / Danger tabs split across `EditPlanGeneralTab`, `EditPlanDestinationsTab`, `EditPlanDangerTab`) and `DeletePlanDialog`. The Danger tab is gated to owners; the Share button surfaces `ShareDialog` (`features/social/components/ShareDialog.tsx`) for owners.

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

## 6. Real-time co-editing (Phase 6, shipped 2026-05-06)

Source contract: [`COLLAB.md`](COLLAB.md).

1. Two peers (A and B) open the same `/plans/{id}`. Each runs flow #3 and ends up with a Hocuspocus provider connected to `ws://collab/...?plan_id=…&token=<jwt>`.
2. Hocuspocus `onAuthenticate` POSTs `{token, plan_id}` + `X-Collab-Secret` header to `POST /internal/collab/authorize` (`backend/app/routes/collab.py` → `services/collab/authorize.py:resolve_role`). Response `{ok, role, userId, planId}`. The connection's `readOnly` flag is set when `role === "viewer"`.
3. Cold load: if `plans.yjs_state IS NULL`, the `Database` extension's fetch callback falls back to `GET /internal/collab/seed?plan_id=…` (`services/collab/seed.py:build_seed_update_b64`). Backend assembles a fresh Y.Doc from `plan_items` + `plan_days.notes` and base64-encodes its update.
4. Peer A drags an item → `lib/yjs/mutations.ts:reorderItems` runs inside a single `Y.transact` on the local Y.Doc.
5. Hocuspocus broadcasts the update; peer B's provider applies it; the `useYAllItems` observer fires; the `usePlanItinerary` slice updates and React re-renders the itinerary in place.
6. After `YJS_IDLE_MS` (default 30s) of quiet, Hocuspocus emits `onChange` → POSTs `/internal/collab/changed`. `services/collab/materializer.py:schedule(plan_id)` cancels any pending task for that plan and starts a fresh debounce timer.
7. When the timer fires, the materializer `SELECT`s `yjs_state`, decodes with `pycrdt.Doc().apply_update(state)`, reads `items` + `day_notes`, and reconciles `plan_items` (full upsert+delete scoped by `plan_id`) and `plan_days.notes` (UPDATE for day_ids that already belong to this plan). Hotels, destinations, and the day lifecycle stay REST-driven and are explicitly skipped.
8. Viewer enforcement is layered: server-side via Hocuspocus `readOnly` (drops sync writes), frontend via mutation short-circuits in `usePlanItinerary` / `useDayNotes` / `useItemNotes`, and UI via infinite drag-activation distance.

## 7. Find a friend, send / accept a request

1. User opens `/social/friends` (`frontend/src/app/social/friends/page.tsx`) or hits the Friends link in `components/layout/Header.tsx`.
2. `features/social/components/FriendsExplorer.tsx` mounts with three tabs: `AddFriendsTab` (search), `FriendListRow` (current friends), and incoming/outgoing requests.
3. Search: `FriendSearchBar` debounces input → `useUserSearch` → `GET /social/users/search?q=…` → `backend/app/routes/social.py:search_users_route` → `services/users/search.py:search_profiles` (Postgres `ilike` against `username` / `display_name`).
4. Send request: `useFriends.sendRequest(addressee_id)` → `POST /social/friends/request` → `services/social/friends.py:send_request` (inserts a `friendships` row with `status='pending'`).
5. Accept / reject: addressee sees the row in their incoming list; `useFriends.respond(id, accept|reject)` → `POST /social/friends/accept/{id}` or `/reject/{id}` → `services/social/friends.py:respond_to_request` flips the status. Both clients re-fetch (no realtime here yet).

## 8. Share a plan via invite link

1. Owner clicks Share in `PlanHeader` → `ShareDialog` mounts (`features/social/components/ShareDialog.tsx`). Dialog has Members and Invites tabs.
2. **Members tab** (`MembersTab.tsx`): owner adds a known username → `usePlanMembers.add` → `POST /plans/{id}/members` → `services/social/members.py:add_member_by_owner` (looks up the user, inserts a `plan_members` row with the chosen role).
3. **Invites tab** (`InvitesTab.tsx`): owner picks role (`viewer` / `editor`), max-uses, expires-at → `useInvites.create` → `POST /plans/{id}/invites` → `services/social/invites.py:create_invite` (inserts `plan_invites` row, returns the token + canonical URL `/invite/{token}`).
4. Recipient opens the URL while logged out → middleware bounces through `/login?next=/invite/{token}` (flow #1).
5. After sign-in the user lands on `frontend/src/app/invite/[token]/page.tsx` → `POST /invite/{token}/accept` → `routes/social.py:invite_router` → `services/social/invites.py:accept_invite`. Server checks expiry, max-uses, and current membership; upserts `plan_members`, increments `uses` on the invite row, returns `{plan_id, role}`.
6. Page redirects to `/plans/{plan_id}` and the user joins flow #3 with the granted role baked in (server-side role check on every load).
