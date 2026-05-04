-- Ajmo schema v2
-- Source of truth. See docs/DATA_MODEL.md for shape + intent.
-- Single-file schema (no migrations folder). Destructive rewrite — dev data only.

-- Extensions -----------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Enums ----------------------------------------------------------------------
do $$ begin
  create type plan_visibility as enum ('private', 'link', 'friends', 'public');
exception when duplicate_object then null; end $$;

do $$ begin
  create type plan_role as enum ('viewer', 'editor', 'owner');
exception when duplicate_object then null; end $$;

do $$ begin
  create type friendship_status as enum ('pending', 'accepted', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reaction_kind as enum ('like', 'dislike', 'love', 'bookmark');
exception when duplicate_object then null; end $$;

-- Identity -------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  bio text,
  tour_completed_at timestamptz,
  created_at timestamptz default now()
);

create table user_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  interest_tags text[],
  dietary text[],
  budget text,
  custom_notes text
);

-- Plans ----------------------------------------------------------------------
create table plans (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid references profiles(id) on delete cascade,
  title text not null,
  description text,
  date_from date,
  date_to date,
  visibility plan_visibility not null default 'private',
  cover_image_path text,
  cover_image_url text,
  yjs_state bytea,
  suggestions jsonb,
  transport_suggestions jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table plan_members (
  plan_id uuid references plans(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role plan_role not null default 'viewer',
  joined_at timestamptz default now(),
  primary key (plan_id, user_id)
);

create table plan_destinations (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid references plans(id) on delete cascade,
  country text not null,
  city text not null,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create table plan_destination_days (
  destination_id uuid references plan_destinations(id) on delete cascade,
  day_number integer not null,
  primary key (destination_id, day_number)
);

create table plan_days (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid references plans(id) on delete cascade,
  day_number integer not null,
  date date,
  title text,
  notes text
);

create table plan_items (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid references plans(id) on delete cascade,
  day_id uuid references plan_days(id) on delete cascade,
  added_by uuid references profiles(id),
  item_type text not null,
  title text not null,
  notes text,
  location text,
  start_time time,
  end_time time,
  duration_minutes integer,
  sort_key text,
  sort_order integer,
  ai_data jsonb,
  destination_id uuid references plan_destinations(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on column plan_items.sort_order is 'Deprecated — use sort_key. Kept one release for safety.';

create table plan_hotels (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid references plans(id) on delete cascade,
  place_id uuid,
  destination_id uuid references plan_destinations(id) on delete set null,
  check_in_day_number integer not null,
  check_out_day_number integer not null,
  check_in_time time,
  check_out_time time,
  notes text,
  sort_key text,
  created_at timestamptz default now(),
  check (check_out_day_number >= check_in_day_number)
);

-- Social ---------------------------------------------------------------------
create table friendships (
  id uuid primary key default uuid_generate_v4(),
  requester_id uuid references profiles(id) on delete cascade,
  addressee_id uuid references profiles(id) on delete cascade,
  status friendship_status not null default 'pending',
  created_at timestamptz default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table plan_invites (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid references plans(id) on delete cascade,
  token text unique not null,
  role plan_role not null default 'viewer',
  expires_at timestamptz,
  max_uses integer,
  uses integer not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table plan_comments (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid references plans(id) on delete cascade,
  plan_item_id uuid references plan_items(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body text not null,
  parent_id uuid references plan_comments(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table plan_item_reactions (
  plan_item_id uuid references plan_items(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  kind reaction_kind not null,
  created_at timestamptz default now(),
  primary key (plan_item_id, user_id, kind)
);

create table plan_item_ratings (
  plan_item_id uuid references plan_items(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (plan_item_id, user_id)
);

create table plan_activity (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid references plans(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  kind text not null,
  payload jsonb,
  created_at timestamptz default now()
);

-- AI / RAG -------------------------------------------------------------------
create table places (
  id uuid primary key default uuid_generate_v4(),
  slug text not null,
  item_type text not null,
  name text not null,
  destination text not null,
  description text,
  location text,
  image_url text,
  lat decimal(9,6),
  lng decimal(9,6),
  timezone text,
  categories text[],
  created_at timestamptz default now(),
  unique (slug, item_type)
);

create table slug_aliases (
  raw_slug text primary key,
  canonical_slug text not null,
  created_at timestamptz default now()
);

create table ai_attraction_cache (
  cache_key text primary key,
  data jsonb,
  fetched_at timestamptz default now(),
  expires_at timestamptz
);

-- Indexes (hot paths) --------------------------------------------------------
create index idx_plans_owner on plans(owner_id);
create index idx_plan_members_user on plan_members(user_id);
create index idx_plan_destinations_plan on plan_destinations(plan_id);
create index idx_plan_days_plan on plan_days(plan_id);
create index idx_plan_items_plan on plan_items(plan_id);
create index idx_plan_items_day on plan_items(day_id);
create index idx_plan_items_destination on plan_items(destination_id);
create index idx_plan_hotels_plan on plan_hotels(plan_id);
create index idx_plan_comments_plan_created on plan_comments(plan_id, created_at desc);
create index idx_plan_comments_item on plan_comments(plan_item_id);
create index idx_plan_invites_token on plan_invites(token);
create index idx_plan_item_reactions_item on plan_item_reactions(plan_item_id);
create index idx_plan_item_ratings_item on plan_item_ratings(plan_item_id);
create index idx_plan_activity_plan_created on plan_activity(plan_id, created_at desc);
create index idx_friendships_requester on friendships(requester_id);
create index idx_friendships_addressee on friendships(addressee_id);
create index idx_places_slug on places(slug);
create index idx_places_name_destination on places(destination, item_type, name);
create index idx_slug_aliases_canonical on slug_aliases(canonical_slug);
create index idx_ai_attraction_cache_expires on ai_attraction_cache(expires_at);

-- RLS ------------------------------------------------------------------------
alter table profiles enable row level security;
alter table user_preferences enable row level security;
alter table plans enable row level security;
alter table plan_members enable row level security;
alter table plan_days enable row level security;
alter table plan_items enable row level security;
alter table plan_destinations enable row level security;
alter table plan_hotels enable row level security;
alter table friendships enable row level security;
alter table plan_invites enable row level security;
alter table plan_comments enable row level security;
alter table plan_item_reactions enable row level security;
alter table plan_item_ratings enable row level security;
alter table plan_activity enable row level security;
alter table places enable row level security;
-- ai_attraction_cache, slug_aliases, plan_destination_days: backend-only, no RLS policies.
-- Service-role key bypasses RLS intentionally for these.

-- Helper: is the current user a member of the plan?
create or replace function is_plan_member(plan uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from plan_members pm
    where pm.plan_id = plan and pm.user_id = auth.uid()
  ) or exists (
    select 1 from plans p where p.id = plan and p.owner_id = auth.uid()
  );
$$;

create or replace function is_plan_editor(plan uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from plan_members pm
    where pm.plan_id = plan
      and pm.user_id = auth.uid()
      and pm.role in ('editor', 'owner')
  ) or exists (
    select 1 from plans p where p.id = plan and p.owner_id = auth.uid()
  );
$$;

create or replace function are_friends(other uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from friendships f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = other)
        or (f.requester_id = other and f.addressee_id = auth.uid()))
  );
$$;

-- Profiles: public read of username/display/avatar, self-write.
create policy "profiles readable to authed" on profiles
  for select using (auth.role() = 'authenticated');
create policy "self update profile" on profiles
  for update using (auth.uid() = id);
create policy "self insert profile" on profiles
  for insert with check (auth.uid() = id);

-- Preferences: self only.
create policy "self read prefs" on user_preferences
  for select using (auth.uid() = user_id);
create policy "self write prefs" on user_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Plans: member-or-visibility read; owner write.
create policy "plan visibility read" on plans
  for select using (
    auth.uid() = owner_id
    or is_plan_member(id)
    or visibility = 'public'
    or (visibility = 'friends' and are_friends(owner_id))
    or visibility = 'link'
  );
create policy "owner writes plan" on plans
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Plan members: readable by members, writable by owner.
create policy "members read members" on plan_members
  for select using (is_plan_member(plan_id));
create policy "owner writes members" on plan_members
  for all using (
    exists (select 1 from plans p where p.id = plan_id and p.owner_id = auth.uid())
  );

-- Plan destinations: scoped to plan member.
create policy "member reads destinations" on plan_destinations
  for select using (is_plan_member(plan_id));
create policy "editor writes destinations" on plan_destinations
  for all using (is_plan_editor(plan_id)) with check (is_plan_editor(plan_id));

-- Plan days: scoped to plan member.
create policy "member reads days" on plan_days
  for select using (is_plan_member(plan_id));
create policy "editor writes days" on plan_days
  for all using (is_plan_editor(plan_id)) with check (is_plan_editor(plan_id));

-- Plan items: scoped to plan member.
create policy "member reads items" on plan_items
  for select using (is_plan_member(plan_id));
create policy "editor writes items" on plan_items
  for all using (is_plan_editor(plan_id)) with check (is_plan_editor(plan_id));

-- Plan hotels: scoped to plan member.
create policy "member reads hotels" on plan_hotels
  for select using (is_plan_member(plan_id));
create policy "editor writes hotels" on plan_hotels
  for all using (is_plan_editor(plan_id)) with check (is_plan_editor(plan_id));

-- Friendships: visible to both parties.
create policy "read friendship" on friendships
  for select using (auth.uid() in (requester_id, addressee_id));
create policy "write own friendship request" on friendships
  for insert with check (auth.uid() = requester_id);
create policy "update own friendship edge" on friendships
  for update using (auth.uid() in (requester_id, addressee_id));
create policy "delete own friendship edge" on friendships
  for delete using (auth.uid() in (requester_id, addressee_id));

-- Plan invites: readable by plan member; writable by owner.
create policy "member reads invites" on plan_invites
  for select using (is_plan_member(plan_id));
create policy "owner writes invites" on plan_invites
  for all using (
    exists (select 1 from plans p where p.id = plan_id and p.owner_id = auth.uid())
  );

-- Plan comments: member read; author writes own.
create policy "member reads comments" on plan_comments
  for select using (is_plan_member(plan_id));
create policy "member inserts comment" on plan_comments
  for insert with check (is_plan_member(plan_id) and auth.uid() = author_id);
create policy "author updates comment" on plan_comments
  for update using (auth.uid() = author_id);
create policy "author deletes comment" on plan_comments
  for delete using (auth.uid() = author_id);

-- Reactions: member read; self write.
create policy "member reads reactions" on plan_item_reactions
  for select using (
    exists (select 1 from plan_items pi where pi.id = plan_item_id and is_plan_member(pi.plan_id))
  );
create policy "self writes reaction" on plan_item_reactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Ratings: member read; self write.
create policy "member reads ratings" on plan_item_ratings
  for select using (
    exists (select 1 from plan_items pi where pi.id = plan_item_id and is_plan_member(pi.plan_id))
  );
create policy "self writes rating" on plan_item_ratings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Activity: member read; backend writes only (service_role bypasses RLS).
create policy "member reads activity" on plan_activity
  for select using (is_plan_member(plan_id));

-- Places: readable by all authed users (autocomplete). Backend-only writes.
create policy "authed reads places" on places
  for select using (auth.role() = 'authenticated');

-- Trigger: auto-create profile row when auth user is created.
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'preferred_username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Trigger: maintain updated_at on plans / items / comments / ratings.
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger plans_touch before update on plans
  for each row execute procedure touch_updated_at();
create trigger plan_items_touch before update on plan_items
  for each row execute procedure touch_updated_at();
create trigger plan_comments_touch before update on plan_comments
  for each row execute procedure touch_updated_at();
create trigger plan_item_ratings_touch before update on plan_item_ratings
  for each row execute procedure touch_updated_at();

-- Storage buckets ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('plan-covers', 'plan-covers', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('user-avatars', 'user-avatars', true)
on conflict (id) do nothing;

-- Public read on both buckets so covers + avatars render without auth.
drop policy if exists "public read plan-covers" on storage.objects;
create policy "public read plan-covers" on storage.objects
  for select
  using (bucket_id = 'plan-covers');

drop policy if exists "public read user-avatars" on storage.objects;
create policy "public read user-avatars" on storage.objects
  for select
  using (bucket_id = 'user-avatars');

-- Writes restricted to the uploader's own folder: first path segment must be auth.uid().
-- plan-covers path scheme: {owner_id}/{plan_id}/{filename}
-- user-avatars path scheme: {user_id}/{filename}
drop policy if exists "owner write plan-covers" on storage.objects;
create policy "owner write plan-covers" on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'plan-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'plan-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "owner write user-avatars" on storage.objects;
create policy "owner write user-avatars" on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'user-avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'user-avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
