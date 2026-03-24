-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (extends Supabase auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz default now()
);

-- User preferences
create table user_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  interest_tags text[],
  dietary text[],
  budget text,
  custom_notes text
);

-- Plans
create table plans (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid references profiles(id) on delete cascade,
  title text not null,
  description text,
  destination text,
  date_from date,
  date_to date,
  is_public boolean default false,
  cover_image_url text,
  yjs_state bytea,
  created_at timestamptz default now()
);

-- Plan members
create table plan_members (
  plan_id uuid references plans(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text default 'viewer',
  joined_at timestamptz default now(),
  primary key (plan_id, user_id)
);

-- Plan days
create table plan_days (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid references plans(id) on delete cascade,
  day_number integer not null,
  date date,
  title text
);

-- Plan items
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
  estimated_cost numeric,
  sort_order integer,
  ai_data jsonb
);

-- Friendships
create table friendships (
  id uuid primary key default uuid_generate_v4(),
  requester_id uuid references profiles(id) on delete cascade,
  addressee_id uuid references profiles(id) on delete cascade,
  status text default 'pending',
  created_at timestamptz default now()
);

-- Places — permanent knowledge base, populated by first user to search
-- Never expires. Powers autocomplete for all users.
-- Backend-only writes (service_role). Frontend reads via /places/autocomplete endpoint.
create table places (
  id uuid primary key default uuid_generate_v4(),
  slug text not null,                  -- "{name-slug}-{item_type}", matches ai_attraction_cache key prefix
  item_type text not null,             -- attraction | restaurant | hotel | transport | activity
  name text not null,
  destination text not null,           -- city/region the place belongs to
  description text,
  location text,                       -- address or area (e.g. "Champ de Mars, Paris")
  image_url text,
  created_at timestamptz default now(),
  unique (slug, item_type)             -- prevent duplicate entries for same place+type
);

-- Index for autocomplete prefix queries
create index places_name_destination_idx on places (destination, item_type, name);

-- Slug alias table: maps raw input slugs → canonical slugs resolved by Gemini
-- Populated after every LLM call; enables cache hits on subsequent partial/misspelled inputs
-- Backend-only via service_role (no RLS policies needed)
create table slug_aliases (
  raw_slug       text primary key,
  canonical_slug text not null,
  created_at     timestamptz default now()
);

create index idx_slug_aliases_canonical on slug_aliases(canonical_slug);

-- AI cache tables
create table ai_attraction_cache (
  cache_key text primary key,
  data jsonb,
  fetched_at timestamptz default now(),
  expires_at timestamptz
);

create table ai_suggestions_cache (
  cache_key text primary key,
  destination text,
  suggestions jsonb,
  fetched_at timestamptz default now(),
  expires_at timestamptz
);

-- RLS: enable on all tables
alter table profiles enable row level security;
alter table user_preferences enable row level security;
alter table plans enable row level security;
alter table plan_members enable row level security;
alter table plan_days enable row level security;
alter table plan_items enable row level security;
alter table friendships enable row level security;
alter table places enable row level security;
-- Note: ai_attraction_cache and ai_suggestions_cache intentionally have NO RLS policies
-- They are backend-only via service_role key

-- Basic RLS policies (users see their own data)
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

create policy "Plan members can view plan" on plans for select using (
  auth.uid() = owner_id or
  exists (select 1 from plan_members where plan_id = plans.id and user_id = auth.uid())
);
create policy "Owner can modify plan" on plans for all using (auth.uid() = owner_id);
-- Places is readable by all authenticated users (autocomplete), writable by backend only
create policy "Authenticated users can read places" on places for select using (auth.role() = 'authenticated');
-- No insert/update policy for places — only service_role (backend) can write