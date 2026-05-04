# Data model (v2)

See `supabase/schema.sql` for authoritative DDL. This file documents shape + intent.

## Identity

### `auth.users` (managed by Supabase)
- `id uuid` — PK.
- Trigger `on_auth_user_created` → inserts matching `profiles` row.

### `profiles`
- `id uuid` PK, FK → `auth.users(id)`.
- `username text unique not null`, `display_name`, `avatar_url`, `bio`, `created_at`.

### `user_preferences`
- `user_id uuid` PK, FK → `profiles(id)`.
- `interest_tags text[]`, `dietary text[]`, `budget text`, `custom_notes`.

## Plans

### `plans`
- `id, owner_id`, `title`, `description`, `date_from`, `date_to`.
- `visibility` enum: `private | link | friends | public`. Replaces legacy `is_public bool`.
- `cover_image_path text` (Supabase Storage path) + `cover_image_url` (CDN URL).
- `yjs_state bytea` — Hocuspocus-managed Yjs blob. Never written by FastAPI directly.
- `suggestions jsonb` — cached AI suggestions.
- `transport_suggestions jsonb` — `{same_day: {day_id: [...]}, cross_city: [...]}`.

### `plan_members`
- PK `(plan_id, user_id)`.
- `role text default 'viewer'` — `viewer | editor | owner`.

### `plan_destinations`
- `id, plan_id, country, city, sort_order`.
- `plan_destination_days (destination_id, day_number)` maps destinations to day numbers (PK composite).

### `plan_days`
- `id, plan_id, day_number, date, title`.
- **NEW** `notes text` — per-day freeform.

### `plan_items`
- `id, plan_id, day_id, added_by, item_type, title, notes, location, start_time`.
- **NEW** `end_time time`, `duration_minutes int`.
- **NEW** `sort_key text` — fractional index, authoritative ordering.
- Legacy `sort_order int` kept one release for safety.
- `ai_data jsonb` — `EnrichedItem | CrossCityMarker | SameDayMarker | null`.
- `destination_id uuid null` — some items (notably transport) may be destination-agnostic.

### `plan_hotels` (new)
- `id, plan_id, place_id, destination_id, check_in_day_number, check_out_day_number, check_in_time, check_out_time, notes, sort_key`.
- First-class multi-night stays. Renders as coloured band across day tabs.

## Social

### `friendships`
- `id, requester_id, addressee_id, status text`.
- `status` ∈ `pending | accepted | rejected`.

### `plan_invites` (new)
- `id, plan_id, token unique, role, expires_at, max_uses, uses, created_by, created_at`.

### `plan_comments` (new)
- Threaded: `id, plan_id, plan_item_id nullable, author_id, body, parent_id nullable, created_at, updated_at, deleted_at`.

### `plan_item_reactions` (new)
- PK `(plan_item_id, user_id, kind)`. `kind ∈ like | dislike | love | bookmark`.

### `plan_item_ratings` (new)
- PK `(plan_item_id, user_id)`. `stars int check (stars between 1 and 5)`.

### `plan_activity` (new)
- Append-only: `id, plan_id, actor_id, kind text, payload jsonb, created_at`.

## AI / RAG

### `places` (permanent)
- `id, slug, item_type, name, destination, description, location, image_url`.
- **NEW** `lat decimal(9,6), lng decimal(9,6), timezone text, categories text[]`.
- Unique `(slug, item_type)`. Backend-only writes.

### `ai_attraction_cache` (24h TTL)
- `cache_key text PK, data jsonb, fetched_at, expires_at`.
- Backend-only.

### `slug_aliases`
- `raw_slug text PK, canonical_slug text not null, created_at`.
- Backend-only.

## Indexes (hot paths)

- `plan_items(plan_id)`, `plan_items(day_id)`, `plan_items(destination_id)`.
- `plan_days(plan_id)`.
- `plan_members(user_id)`.
- `friendships(requester_id)`, `friendships(addressee_id)`.
- `plan_hotels(plan_id)`.
- `plan_comments(plan_id, created_at desc)`.
- `plan_invites(token) unique`.
- `plan_item_reactions(plan_item_id)`.
- `plan_item_ratings(plan_item_id)`.
- `plan_activity(plan_id, created_at desc)`.
- `places.slug`, `places(destination, item_type, name)` (autocomplete).
- `slug_aliases(canonical_slug)`.
- `ai_attraction_cache(expires_at)`.

## RLS policy classes

- **Plan-scoped**: readable by `owner_id` or anyone in `plan_members`. Writable by owner + editors.
- **User-scoped**: readable/writable only by `auth.uid() = user_id`. Covers profiles, preferences.
- **Friendship**: readable by `auth.uid() in (requester_id, addressee_id)`.
- **Visibility-driven**: `plans` with `visibility in ('public','friends','link')` exposed beyond members per rule.
- **Backend-only (no policies)**: `ai_attraction_cache`, `slug_aliases`, `places` writes, `plan_destination_days`. Service-role bypasses RLS intentionally.
