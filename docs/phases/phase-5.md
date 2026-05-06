# Phase 5 — Social (friends, sharing, comments, reactions, ratings)

**Exit bar**: friends can be found, invited, and accepted; plans can be shared by role or by link; threaded comments, reactions, 1-5★ ratings, and an activity feed all work. No real-time editing yet — this phase makes the app feel collaborative before Phase 6 makes it live.

Ordered before Phase 6 per user preference — social scaffolding is lighter and benefits from being in place before CRDT/Yjs complexity lands.

## Status

**Friends + invites + roles shipped 2026-05-06.** Comments, reactions, ratings, and the activity feed were deferred per user direction — the schema columns exist (per `supabase/schema.sql`) but no routes, services, or UI back them yet. Treat the deferred sections below as a backlog to pull from when the feed surfaces are revisited.

## In scope (shipped)

### Friends

- [x] `/social/friends` page — search users by `username` / `display_name`, send / accept / reject / cancel requests, friends list. — `frontend/src/app/social/friends/page.tsx` + `features/social/components/FriendsExplorer.tsx`, `FriendSearchBar`, `AddFriendsTab`, `FriendListRow`.
- [x] Backend: `/social/friends` (list), `/social/friends/request` (POST), `/social/friends/accept/{id}`, `/social/friends/reject/{id}`, `/social/friends/{user_id}` (DELETE). — `backend/app/routes/social.py` + `services/social/friends.py`. Profile search at `/social/users/search` (`services/users/search.py:search_profiles`).

### Visibility + invites

- [x] `plans.visibility` surfaced in UI: `private | link | friends | public`. Selector in `PlanHeader` settings menu (via `EditPlanGeneralTab` inside `EditPlanDialog`).
- [x] `POST /plans/{id}/invites` → generates signed token, writes `plan_invites` row, returns URL `/invite/{token}`. — `routes/social.py:plan_invites_router` + `services/social/invites.py:create_invite`.
- [x] `POST /invite/{token}/accept` resolves to `{plan_id, role}`, adds requester to `plan_members` with that role, increments `uses`, rejects if `expires_at` past or `uses >= max_uses`. — `routes/social.py:invite_router` + `services/social/invites.py:accept_invite`. Frontend redeem page at `frontend/src/app/invite/[token]/page.tsx`.
- [x] Owner panel: manage members — add by username, change role (`viewer`/`editor`), remove. — `features/social/components/MembersTab.tsx` + `ShareDialog.tsx` (opened from `PlanHeader`); backend `services/social/members.py`.

### Backend routes (shipped subset)

- [x] `/social/friends/*` and `/social/users/search`.
- [x] `/plans/{id}/invites` (list/create/revoke), `/invite/{token}/accept` (claim), `/plans/{id}/members` (add/list/update-role/remove).

## Out of scope (deferred to a later pass)

The following sub-features are still wanted but were dropped from the Phase 5 ship. The DB columns are already in `supabase/schema.sql`; no backend code or UI exists yet.

### Comments (deferred)

- [ ] Threaded comments on plans and items: `plan_comments(plan_id, plan_item_id nullable, author_id, body, parent_id nullable, created_at, updated_at, deleted_at)`.
- [ ] Supabase Realtime channel `plan:{id}:comments` for live fanout. RLS allows subscription when `auth.uid()` in `plan_members(plan_id)`.
- [ ] UI: comments side panel toggled from header. Threaded replies 1 level deep. Soft-delete shows "comment removed" placeholder.

### Reactions (deferred)

- [ ] `plan_item_reactions(plan_item_id, user_id, kind)` PK on all three. `kind ∈ like | dislike | love | bookmark`.
- [ ] UI: small strip under each item card. Counts + my-reaction state.

### Ratings (deferred)

- [ ] `plan_item_ratings(plan_item_id, user_id, stars 1..5)` PK on first two.
- [ ] Aggregate `AVG(stars)` + count on item card.

### Activity feed (deferred)

- [ ] `plan_activity(plan_id, actor_id, kind, payload jsonb, created_at)` — append-only.
- [ ] Writers: plan creation, member add/remove, item add/update/delete, comment, reaction, rating.
- [ ] UI: right-rail activity feed with emoji-per-kind + relative timestamp.

### Deferred routes

- [ ] `/plans/{id}/comments` GET/POST, `/plans/{id}/comments/{comment_id}` PATCH/DELETE.
- [ ] `/plans/{id}/reactions` GET/POST/DELETE.
- [ ] `/plans/{id}/ratings` GET/PUT/DELETE.
- [ ] `/plans/{id}/activity` GET.

### Always out of scope (handled elsewhere)

- Real-time live cursors / co-editing — Phase 6.
- Presence awareness — Phase 6 (deferred there too).
- Offline write queue — Phase 7.

## Verification

- Friending: browser A searches for browser B's username → sends request → browser B accepts → friendship row flips `accepted` and both sides see each other in `FriendsExplorer`.
- Invite link flow: owner generates link in `ShareDialog` → logged-out user opens `/invite/{token}` → middleware bounces through `/login?next=/invite/...` → after sign-in lands on the plan as the role baked into the token.
- Roles: editor can mutate items/notes; viewer is short-circuited in `usePlanItinerary` *and* server-side via Hocuspocus `readOnly` (Phase 6 wiring).
- RLS sanity: a non-member's direct Supabase REST read of a plan with `visibility = 'private'` returns zero rows.
- Comments/reactions/ratings/activity verification stays parked until those features ship.
