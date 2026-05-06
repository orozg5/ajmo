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
| change cross-city transport routing | `backend/app/services/transport/cross_city.py` (multi-source orchestrator) — also `services/transport/osrm.py`, `services/transport/flight_estimator.py`, `services/transit/directions.py` |
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
| add a new API call | hand-write a request function in `frontend/src/lib/api/<domain>.ts` on top of `apiFetch` / `apiSse` from `client.ts` |
| like, rate, or comment on an item | Yjs mutations only — `lib/yjs/mutations.ts` (`toggleLike`, `setRating`/`clearRating`, `postComment`/`editComment`/`deleteComment`). UI components: `features/plans/components/itinerary/{ItemLike,ItemRating,ItemComments}.tsx` + `features/social/components/CommentsSheet.tsx`. |
| open the plan-wide chat or per-item comments | `features/social/components/CommentsSheet.tsx` (`scopedItemId={null}` from `PlanHeader`'s "Chat" button; `scopedItemId={item.id}` from each item's 💬 button) |
| publish or read presence/typing | `features/plans/components/awareness/{AwarenessPublisher,EditingPresence,PresenceStrip}.tsx` + `features/plans/hooks/useEditingReporter.ts`. Awareness shape: `lib/yjs/schema.ts:AwarenessState`. Reader hook: `lib/yjs/hooks.ts:useRemoteAwareness`. |
| browse / send / accept friend requests | `frontend/src/app/social/friends/page.tsx` + `features/social/components/{FriendsExplorer,FriendSearchBar,AddFriendsTab,FriendListRow}.tsx` |
| share a plan or generate an invite link | `features/social/components/ShareDialog.tsx` (opened from `PlanHeader`); backend `routes/social.py` (`plan_invites_router`) + `services/social/invites.py` |
| redeem an invite link | `frontend/src/app/invite/[token]/page.tsx` → `POST /invite/{token}/accept` → `services/social/invites.py:accept_invite` |
| resolve a user's role on a plan | backend `services/social/members.py:get_role`; frontend reads via `lib/api/plans.ts:getMyPlanRole` |
| search profiles by username | `services/users/search.py:search_profiles` (exposed at `GET /social/users/search`) |
| touch the live Yjs doc / write a mutation | `frontend/src/lib/yjs/{schema,provider,mutations,hooks}.ts` — never write to Y.Doc structures from a component |
| change the materializer or cold-load seed | `backend/app/services/collab/{materializer,seed,authorize,schema}.py`; routes in `routes/collab.py` |
| change the DB schema | `supabase/schema.sql` (single source of truth) |
| document an architectural decision | `docs/DECISIONS.md` (ADR-style entry) |
| track a phase's scope/progress | `docs/phases/phase-N.md` + update `PROGRESS.md` |

## Top-level folders

- **`frontend/`** — Next.js 15 App Router + Tailwind + Shadcn. See `frontend/CLAUDE.md` for directory layout, state layering, auth pattern, and hard constraints.
- **`backend/`** — FastAPI + Pydantic. All AI/RAG pipelines live here. See `backend/CLAUDE.md` for the route/service/schema split and structured-output rules.
- **`collab/`** — Hocuspocus Yjs WebSocket server (shipped Phase 6). See `collab/CLAUDE.md`.
- **`supabase/`** — DB schema and RLS policies. `schema.sql` is the source of truth.
- **`docs/`** — Audit, ADRs, per-phase plans, this file, `APP_FLOW.md`, `COLLAB.md`. See `docs/CLAUDE.md` for style rules.

## Backend subfolder quick reference

- **`app/routes/`** — one file per resource (`plans.py`, `plan_items.py`, `ai.py`, `places.py`, `storage.py`, `users.py`, `social.py`, `collab.py`, …). Thin; delegates to `services/`. `routes/social.py` exports four routers (`friends_router`, `plan_members_router`, `plan_invites_router`, `invite_router`) under different prefixes; `routes/collab.py` is shared-secret-guarded and lives at `/internal/collab/*`.
- **`app/schemas/`** — Pydantic HTTP contracts. Note: `schemas/ai.py` is the HTTP side; `services/ai/schemas.py` is the LLM-side (structured-output) schemas — they are distinct by design. `schemas/social.py` covers friends/invites/members request+response models.
- **`app/services/ai/`** — LLM pipeline. `llm.py` (provider chain), `enrichment.py` (item enrichment), `suggestions.py` (per-plan suggestions), `transport.py` (cross-city pair cache) → `transport_pairs.py` (pair graph). Cross-city orchestration moved to `services/transport/` (no LLM) — see ADR 2026-05-06.
- **`app/services/transit/`** — `directions.py` (Transitous public-transit MOTIS plan endpoint, lazy `httpx.AsyncClient`).
- **`app/services/transport/`** — `cross_city.py` (multi-source pair orchestrator), `osrm.py` (FOSSGIS OSRM walk/bike/drive), `flight_estimator.py` (haversine + cruise estimate, no API).
- **`app/services/places/`** — places cache, geocoding (Nominatim only), images (Pexels), repository.
- **`app/services/plans/`** — hotels, destinations, day materialization (`days.py:sync_days` reconciles plan date range; `DateShrinkBlocked` raised when items would be dropped).
- **`app/services/users/`** — user profile helpers (`preferences.py`, `search.py:search_profiles`).
- **`app/services/social/`** — `friends.py` (friend requests + accept/reject + remove), `invites.py` (token creation, accept, revoke), `members.py` (`get_role`, owner panel CRUD), `comments.py` / `reactions.py` / `ratings.py` (REST endpoints; the materializer is the only path that writes them in product flows — see `services/collab/materializer.py`), `activity.py` (`safe_record_activity` + `list_activity` for the activity-feed sheet).
- **`app/services/collab/`** — `authorize.py` (JWT → role), `seed.py` (cold-load Y.Doc builder; reads items, day-notes, likes, ratings, comments), `materializer.py` (per-plan debounce task that reconciles `plan_items`, `plan_days.notes`, `plan_item_reactions WHERE kind='like'`, `plan_item_ratings`, `plan_comments`), `schema.py` (canonical `ITEM_FIELDS` + `COMMENT_FIELDS` + Y.Doc root names, mirrored on the frontend).
- **`app/services/storage/`** — Supabase Storage helpers (covers, avatars).
- **`app/auth.py`**, **`app/db.py`**, **`app/config.py`**, **`app/constants.py`** — cross-cutting (JWT verification, Supabase service client factory, settings, shared constants).

## Frontend subfolder quick reference

- **`src/app/`** — routes only. `page.tsx` at root is the dashboard; `plans/[id]/page.tsx` is the itinerary editor; `plans/new/` is the wizard; `(auth)/` is the unauthenticated route group; `auth/callback/route.ts` is the OAuth handler; `social/friends/page.tsx` is the friends UI; `invite/[token]/page.tsx` is the invite-redeem landing; `settings/{layout,page}.tsx` is the shared settings shell + landing route, with `settings/preferences/` and `settings/profile/` underneath.
- **`src/components/ui/`** — Shadcn primitives only, never feature code.
- **`src/components/layout/`** — `AppShell`, `Header` (now exposes a Friends link), `Sidebar`, `ErrorBoundary`.
- **`src/features/plans/components/`** — organized by concern: `dashboard/`, `itinerary/`, `destinations/`, `search/`, `transport/`, `hotels/`, `wizard/`, `awareness/`. See `src/features/plans/README.md`. `itinerary/PlanWorkspace.tsx` is the role-aware shell that initializes the Yjs doc, mounts `PlanCollabProvider` (so child components access `{doc, provider, currentUserId, currentUser}` without prop drilling), renders `AwarenessPublisher`, and threads `role` + `doc` + `liveMeta` into `PlanHeader` + `ItineraryPlanner`. `itinerary/{ItemLike,ItemRating,ItemComments}.tsx` are the per-item social affordances. `awareness/{AwarenessPublisher,EditingPresence,PresenceStrip}.tsx` handle presence.
- **`src/features/plans/hooks/`** — data-fetching hooks (`usePlanItinerary`, `useSameDayTransportOptions`, `useSameDayTransportInsert`, `useCrossCityTransport`, `useHotels`, `useAiSuggestions`, `useItemEnrichment`, `useDayNotes`, `useItemNotes`, `useDashboardPlans`, `useCoverUpload`, `useDestinations`, `usePlanFilters`) plus collab plumbing (`PlanCollabContext.tsx` exposing `usePlanCollab`, `useEditingReporter`). `usePlanItinerary` / `useDayNotes` / `useItemNotes` write through the Y.Doc via `lib/yjs/mutations.ts`.
- **`src/features/plans/utils/`** — pure helpers shared across the feature (`sortKeys`, `visibility`, `itemType`, `fieldLabels`, `crossCityPayload`, `dragEndToReorderEntry`, `tripStatus`, `formatDateRange`, `transportFormat`).
- **`src/features/auth/components/`** — `LoginForm` (reads `?next=` for post-login redirect), `RegisterForm`, `LogoutButton`.
- **`src/features/map/`** — MapLibre components + style helpers (Phase 4).
- **`src/features/social/`** — `components/{FriendsExplorer,FriendSearchBar,AddFriendsTab,FriendListRow,ShareDialog,MembersTab,InvitesTab,CommentsSheet,CommentThread,ActivitySheet}.tsx` + `hooks/{useFriends,useUserSearch,usePlanMembers,useInvites,usePlanActivity}.ts`. `CommentsSheet` is one component for both plan-wide chat (`scopedItemId={null}`) and per-item comments (`scopedItemId={item.id}`); the per-item button is `features/plans/components/itinerary/ItemComments.tsx`. Comments/likes/ratings live on the Y.Doc — no react-query hook for those.
- **`src/features/settings/components/`** — `PreferencesForm`, `ProfileForm`, `SettingsTabs`. Shared enums in `features/settings/constants.ts`.
- **`src/lib/api/`** — runtime fetch wrapper (`client.ts` — `apiFetch` + inline SSE parser) + per-domain hand-typed shims (`plans.ts`, `ai.ts`, `transit.ts`, `social.ts`, …).
- **`src/lib/supabase/`** — `client.ts` (browser), `server.ts` (SSR), `profile.ts` (RLS-scoped profile chrome fetch for the dashboard greeting).
- **`src/lib/yjs/`** — `schema.ts` (Y.Doc root names + `ITEM_FIELDS` + `COMMENT_FIELDS` + `AwarenessState` mirrored to `backend/app/services/collab/schema.py`), `provider.ts` (Hocuspocus client), `mutations.ts` (`addItem`, `removeItem`, `reorderItems`, `setDayNotes`, `updateItemNotes`, `clearDayContent`, `setPlanMeta`, `toggleLike`, `setRating`, `clearRating`, `postComment`, `editComment`, `deleteComment`), `hooks.ts` (`useYDoc`, `useYAllItems`, `useYAllDayNotes`, `useYPlanMeta`, `useYAllLikes`, `useYAllRatings`, `useYComments`, `useRemoteAwareness`). Components must never call `doc.transact(...)` directly — go through `mutations.ts`.
- **`src/lib/map/`** — MapLibre init, style, marker helpers.
- **`src/stores/`** — Zustand stores (UI state only — theme, toasts, dialogs).

## Where data lives

| Concern | Where |
| --- | --- |
| Live itinerary + social state (while a plan is open) | Yjs Y.Doc via Hocuspocus — `items`, `day_notes`, `likes`, `ratings`, `comments`, plus the `plan_meta` broadcast mirror (shipped 2026-05-06) |
| Awareness / presence (ephemeral) | `provider.awareness` channel — `{user, editing: {kind, id} \| null}` published from the four free-text editors; not persisted, vanishes on disconnect |
| Itinerary + social state at rest | `plans`, `plan_days`, `plan_items`, `plan_destinations`, `plan_hotels`, `plan_item_reactions`, `plan_item_ratings`, `plan_comments`, `plan_activity` (Postgres, via Supabase). Materializer reconciles `plan_items`, `plan_days.notes`, likes/ratings/comments on Y.Doc idle; hotels/destinations/days lifecycle stay REST-driven; `plan_activity` is REST-only. |
| Friend graph + plan membership | `friendships`, `plan_members`, `plan_invites` (Postgres, via Supabase; backend service-role) |
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
