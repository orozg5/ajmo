# Phase 5 — Social (friends, sharing, comments, reactions, ratings)

**Exit bar**: friends can be found, invited, and accepted; plans can be shared by role or by link; threaded comments, reactions, 1-5★ ratings, and an activity feed all work. No real-time editing yet — this phase makes the app feel collaborative before Phase 6 makes it live.

Ordered before Phase 6 per user preference — social scaffolding is lighter and benefits from being in place before CRDT/Yjs complexity lands.

## In scope

### Friends

- [ ] `/social/friends` page — search users by `username` / `display_name`, send / accept / reject / cancel requests, friends list.
- [ ] Backend: `/social/friends` (list), `/social/friends/request` (POST), `/social/friends/accept/{id}`, `/social/friends/reject/{id}`, `/social/friends/{user_id}` (DELETE).

### Visibility + invites

- [ ] `plans.visibility` surfaced in UI: `private | link | friends | public`. Selector in `PlanHeader` settings menu.
- [ ] `POST /plans/{id}/invites` → generates signed token, writes `plan_invites` row, returns URL `/invite/{token}`.
- [ ] `GET /invite/{token}` resolves to `{plan_id, role}`, adds requester to `plan_members` with that role, increments `uses`, rejects if `expires_at` past or `uses >= max_uses`.
- [ ] Owner panel: manage members — add by username, change role (`viewer`/`editor`), remove.

### Comments

- [ ] Threaded comments on plans and items: `plan_comments(plan_id, plan_item_id nullable, author_id, body, parent_id nullable, created_at, updated_at, deleted_at)`.
- [ ] Supabase Realtime channel `plan:{id}:comments` for live fanout. RLS allows subscription when `auth.uid()` in `plan_members(plan_id)`.
- [ ] UI: comments side panel toggled from header. Threaded replies 1 level deep. Soft-delete shows "comment removed" placeholder.

### Reactions

- [ ] `plan_item_reactions(plan_item_id, user_id, kind)` PK on all three. `kind ∈ like | dislike | love | bookmark`.
- [ ] UI: small strip under each item card. Counts + my-reaction state.

### Ratings

- [ ] `plan_item_ratings(plan_item_id, user_id, stars 1..5)` PK on first two.
- [ ] Aggregate `AVG(stars)` + count on item card.

### Activity feed

- [ ] `plan_activity(plan_id, actor_id, kind, payload jsonb, created_at)` — append-only.
- [ ] Writers: plan creation, member add/remove, item add/update/delete, comment, reaction, rating.
- [ ] UI: right-rail activity feed with emoji-per-kind + relative timestamp.

### Backend routes

- [ ] `/social/friends/*`
- [ ] `/plans/{id}/invites`, `/invite/{token}` claim
- [ ] `/plans/{id}/comments` GET/POST, `/plans/{id}/comments/{comment_id}` PATCH/DELETE
- [ ] `/plans/{id}/reactions` GET/POST/DELETE
- [ ] `/plans/{id}/ratings` GET/PUT/DELETE
- [ ] `/plans/{id}/activity` GET

## Out of scope

- Real-time live cursors / co-editing (Phase 6).
- Presence awareness (Phase 6).
- Offline write queue (Phase 7).

## Verification

- Two browsers: browser A comments on a plan, browser B sees the comment within 2s via Realtime channel.
- Invite link flow: owner generates link → logged-out user opens link → is prompted to sign in → lands as viewer on the plan.
- RLS: browser A cannot read comments on a plan they're not a member of (direct SELECT via the Supabase JS client fails).
- Ratings: aggregate updates after stars change, my-star persists on reload.
- Activity feed shows the last 20 events, newest first.
