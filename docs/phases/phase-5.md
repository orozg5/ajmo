# Phase 5 — Social (friends, sharing, likes, ratings, comments, chat, activity)

**Exit bar**: friends can be found, invited, and accepted; plans can be shared by role or by link; per-item likes, 1-5★ ratings, per-item comments, plan-wide chat, and an activity feed all work. Live broadcast piggy-backs on Phase 6's Hocuspocus channel — not a separate transport.

Ordered before Phase 6 in the original plan, but the social-collab story converged on a single Y.Doc (see ADR 2026-05-06 "Likes, ratings, comments move into Yjs"). Friends + invites + roles still landed in this phase before Phase 6's CRDT machinery shipped.

## Status

**Friends + invites + roles shipped 2026-05-06.**

**Likes, ratings, per-item comments, plan-wide chat shipped 2026-05-06**, all on the Y.Doc — three new top-level keys (`likes`, `ratings`, `comments`) materialized to relational on idle by `app/services/collab/materializer.py`. The earlier Supabase-Realtime attempt was reverted same day (UX feedback: too slow, needed the publication toggle the user didn't notice, and the user asked for Yjs-grade live + presence/typing). See ADR `docs/DECISIONS.md` (2026-05-06 "Likes, ratings, comments move into Yjs").

**Activity feed shipped 2026-05-06** as a plain REST resource (`/plans/{id}/activity`). Append-only history, doesn't need live broadcast — loads when its sheet opens, refetches on focus.

Item-level activity events (`item_added`, `item_updated`, `item_deleted`) remain deferred — items flow through Yjs → Hocuspocus → materializer, and hooking the materializer's diff is its own pass.

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

## Shipped 2026-05-06

### Likes (single thumbs-up per item)

- [x] Y.Doc root `likes: Y.Map<itemId, Y.Map<userId, true>>`. Mutation: `lib/yjs/mutations.ts:toggleLike`. Observer: `lib/yjs/hooks.ts:useYAllLikes`.
- [x] UI: `features/plans/components/itinerary/ItemLike.tsx` — single thumbs-up button in the item-card footer row, replaces the old 3-kind reactions strip. (`love`, `bookmark`, `dislike` enum values still exist in the DB enum but are unused; harmless leftover.)
- [x] Materialized to `plan_item_reactions WHERE kind='like'` (insert/delete diff) by `app/services/collab/materializer.py:reconcile_likes`.

### Ratings

- [x] Y.Doc root `ratings: Y.Map<itemId, Y.Map<userId, number>>`. Mutations: `setRating`, `clearRating`. Observer: `useYAllRatings`.
- [x] UI: `features/plans/components/itinerary/ItemRating.tsx` — 5-star widget in the item-card footer row showing my-rating + avg + count.
- [x] Materialized to `plan_item_ratings` (upsert + diff-delete) by `materializer.py:reconcile_ratings`.

### Per-item comments + plan-wide chat

- [x] Y.Doc root `comments: Y.Array<Y.Map>` — flat list, threaded one level deep via `parent_id`, soft-deleted via `deleted_at`. `plan_item_id` is null for chat, set for per-item comments. Mutations: `postComment`, `editComment`, `deleteComment`. Observer: `useYComments`.
- [x] Per-item UI: `features/plans/components/itinerary/ItemComments.tsx` — `MessageCircle` button + count next to `ItemLike` in each item-card footer; opens `CommentsSheet` with `scopedItemId={item.id}`.
- [x] Plan-wide chat: `PlanHeader` button "Chat" (`MessagesSquare` icon) opens the same `CommentsSheet` with `scopedItemId={null}`. Filters comments where `plan_item_id === null`.
- [x] `CommentsSheet` is a single component, two scopes via `scopedItemId: string | null`. Title swaps "Chat" ↔ "Comments — {item title}". Soft-delete shows "comment removed" placeholder. Files: `features/social/components/{CommentsSheet,CommentThread}.tsx`.
- [x] Materialized to `plan_comments` (upsert by id + diff-delete by id; sanitises foreign-plan `plan_item_id`) by `materializer.py:reconcile_comments`.

### Awareness / presence (free-text only)

- [x] `AwarenessState = {user, editing: {kind, id} | null}`. Schema: `lib/yjs/schema.ts`.
- [x] Identity publisher: `features/plans/components/awareness/AwarenessPublisher.tsx` — sets `user` once profile chrome resolves; clears on unmount.
- [x] Reporter hook: `features/plans/hooks/useEditingReporter.ts` — wired on focus/blur of every free-text surface (day notes, item notes, chat composer, per-item comment composer). Last-write-wins so quick focus jumps don't blink.
- [x] Reader: `features/plans/components/awareness/EditingPresence.tsx` — avatar pill next to each free-text label, filtered by `(kind, id)`.
- [x] Global connection strip: `features/plans/components/awareness/PresenceStrip.tsx` — top-right of `PlanHeader`, shows every connected user (one avatar per distinct user-id).
- [x] Hover-presence on items was tried first and dropped per UX feedback — see ADR.

### Activity feed (REST)

- [x] `services/social/activity.py:safe_record_activity` writes from `plans/crud.py` (plan_created), `social/members.py` (member add/remove/role), `social/comments.py` (comment_posted), `social/reactions.py` (reaction_added/removed), `social/ratings.py` (rating_set/cleared). Failures swallowed + logged so the parent op never fails.
- [x] UI: `features/social/components/ActivitySheet.tsx` opened from `PlanHeader`, newest-first list with per-kind icon + relative timestamp. Hook: `features/social/hooks/usePlanActivity.ts` — plain react-query GET, no realtime.

### Endpoints shipped

- [x] `/plans/{id}/comments` GET/POST, `/plans/{id}/comments/{comment_id}` PATCH/DELETE — kept for backend tests; the frontend reads/writes via Yjs and the materializer is the only path that updates these tables in product flows.
- [x] `/plans/{id}/reactions` GET. `/plans/{id}/items/{item_id}/reactions` POST + `/plans/{id}/items/{item_id}/reactions/{kind}` DELETE — same.
- [x] `/plans/{id}/ratings` GET. `/plans/{id}/items/{item_id}/rating` PUT/DELETE — same.
- [x] `/plans/{id}/activity` GET — actively used by the frontend.

## Still deferred

- [ ] Item-level activity events (`item_added`, `item_updated`, `item_deleted`) — items flow through Yjs/Hocuspocus/materializer; hooking the diff is a separate pass.
- [ ] Comment notifications, @mentions, push, e-mail.
- [ ] Activity feed grouping/rollups ("3 new likes on Eiffel Tower").
- [ ] Persisted unread badges on the per-item Comments button (today the count is total non-deleted comments, not "unread since last open").
- [ ] Comment edit affordance (mutation `editComment` exists in `lib/yjs/mutations.ts` but no UI surface).

### Always out of scope (handled elsewhere)

- Cross-tab cursor/selection sharing on the same item — out of scope today.
- Offline write queue — Phase 7.

## Verification

- Friending: browser A searches for browser B's username → sends request → browser B accepts → friendship row flips `accepted` and both sides see each other in `FriendsExplorer`.
- Invite link flow: owner generates link in `ShareDialog` → logged-out user opens `/invite/{token}` → middleware bounces through `/login?next=/invite/...` → after sign-in lands on the plan as the role baked into the token.
- Roles: editor can mutate items/notes; viewer is short-circuited in `usePlanItinerary` *and* server-side via Hocuspocus `readOnly` (Phase 6 wiring).
- RLS sanity: a non-member's direct Supabase REST read of a plan with `visibility = 'private'` returns zero rows.
- **Likes**: browser A clicks the 👍 on an item → button fills, count flips to 1; browser B sees it sub-100ms (Hocuspocus broadcast).
- **Ratings**: browser A clicks 4 stars → my-rating shows 4, avg/count update; browser B's view updates sub-100ms.
- **Per-item comments**: A clicks the 💬 on an item → sheet titled "Comments — {item title}". Posts there appear immediately on A and sub-100ms on B (also viewing that item's sheet). Posts do NOT show in the chat sheet.
- **Plan chat**: A clicks "Chat" in `PlanHeader` → sheet titled "Chat". Posts there only appear in the chat sheet, not on any item-comments sheet.
- **Typing isolation**: A typing in chat shows "Alice is typing…" only in B's chat sheet, not in any item-comments sheet (and vice versa).
- **Free-text presence**: A focuses the day-notes textarea → B sees an avatar pill next to that day's "Day notes" label. A blurs → pill vanishes. Same for item-notes textarea inside an expanded item card.
- **No hover noise**: Hovering items in A produces no presence indication in B.
- Activity: any of the above plus member changes appear in `ActivitySheet` newest-first; created plan logs `plan_created`.
