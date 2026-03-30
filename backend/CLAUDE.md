# Backend — Conventions & Architecture

## Backend conventions

- FastAPI with async everywhere (`async def` for all routes)
- All routes go in `/backend/app/routes/`, one file per domain (plans.py, ai.py, etc.)
- All business logic goes in `/backend/app/services/`, never directly in route handlers
- Supabase client: import `get_supabase_client()` from `app/db.py` — never call `create_client()` directly in service files
- Shared constants (VALID_ITEM_TYPES, etc.): define in `app/constants.py`, import from there — never duplicate across files
- Pydantic response models: define in `app/schemas/responses.py`; all route handlers must declare a typed return annotation using these models
- Config: `pydantic_settings.BaseSettings` in `app/config.py` reads `.env` automatically; required fields raise `ValidationError` at startup if missing; optional fields (`GROQ_API_KEY`, `FALLBACK_AI_MODEL`) default to `None`
- Logging: `logging.basicConfig(level=INFO, ...)` called in `main.py` before `FastAPI()` creation
- Supabase is accessed via service_role key in backend (bypasses RLS intentionally)
- `model_dump(mode="json")` required on Pydantic date fields before passing to supabase-py
- `.limit(1).execute()` — NOT `.maybe_single()` for Supabase single-row queries (supabase-py returns None for the entire result object on no match with maybe_single, not just `.data`)
- All new backend service/route files must follow supabase-service-pattern SKILL exactly

## Database

- Supabase (PostgreSQL) — schema is in /supabase/schema.sql
- RLS is enabled on all tables — AI cache tables and places table are backend-only (service_role bypasses RLS)
- yjs_state column in plans is a BYTEA blob — never modify it directly, only via y-websocket

## Real-time collaboration

- Yjs CRDT for conflict-free state — y-websocket server manages rooms (one per plan)
- On room close, y-websocket flushes binary CRDT state to plans.yjs_state
- Never write itinerary state directly to plan_items during a live session

## AI / RAG pattern — two-layer cache

Enrichment splits data into two tiers:

**Layer 1 — `places` table (permanent, no TTL)**

- Populated on first enrichment, never expires
- Stores stable data: name, destination, item_type, description, location, image_url
- Powers autocomplete: queried on every keystroke (substring match on name + destination)
- First user to search for a place seeds it; all subsequent users get autocomplete instantly

**Layer 2 — `ai_attraction_cache` (fresh data, TTL 24h)**

- Stores volatile data: price_range, opening_hours, tips, reservation_tips, etc.
- Expires after 24h — re-fetched via web search + LLM on cache miss
- Linked to places table by the same slug key

**Enrichment flow (first user):**

1. No autocomplete (places table empty for this item)
2. Debounce fires → POST /ai/enrich
3. Cache miss on both layers → web search + Gemini runs
4. Backend splits response: stable fields → INSERT places, fresh fields → INSERT ai_attraction_cache
5. Full combined result returned to user instantly (no extra wait)

**Enrichment flow (subsequent users):**

1. Autocomplete fires immediately on every keystroke → GET /places/autocomplete → dropdown appears
2. Enrichment is suppressed while the dropdown is open — user must select first
3. User selects suggestion → input fills, dropdown closes → enrichment fires immediately (0ms)
4. places table always has stable data; ai_attraction_cache hit → return immediately / miss → re-fetch fresh fields only
5. If autocomplete returns no results → enrichment fires after 700ms debounce (new place fallback)

**LLM (primary):** Google Gemini — `GOOGLE_API_KEY` + `AI_MODEL` env vars, never hardcoded
**LLM (fallback):** Groq — optional `GROQ_API_KEY` + `FALLBACK_AI_MODEL`; activated automatically when Gemini returns a 429/quota error
**LLM output coercion:** all parsed fields are normalised to their expected type after parsing — list fields (`_LIST_FIELDS`: `tips`, `amenities`) are always `list[str]`; all other fields are always `str`; prevents 500s from the LLM returning arrays for scalar fields
**Autocomplete endpoint:** GET /places/autocomplete?q=&destination=&item_type=

## Cache design decisions

### Why a two-layer cache?

Enrichment data splits naturally into two lifecycles:

- Stable data (name, description, location, image) almost never changes — caching it forever
  in the `places` table is safe and powers instant autocomplete for all users globally.
- Fresh data (price, hours, tips) goes stale within days — a 24h TTL in
  `ai_attraction_cache` balances freshness against Gemini API cost.
  Splitting by lifecycle avoids either over-fetching stable data or serving stale volatile data.

### Why a permanent places table instead of just the cache?

The ai_attraction_cache is keyed by slug and expires. If it expires and the user never
returns, the place disappears. The places table is the durable knowledge base — once a place
is confirmed real by Gemini, it exists forever for autocomplete, regardless of cache TTL.
This also means the second user to search for any place gets autocomplete instantly,
without waiting for enrichment to complete.

### The canonicalization problem

Users type partial or misspelled names ("Hilt" instead of "Hilton Paris Opera"). Raw input
cannot be used as a cache key reliably — "hilt-hotel" will never match "hilton-paris-opera-hotel".
Solution: on a cache miss, Gemini is prompted to return a canonical_name field (the official,
full name of the place). All writes to places and ai_attraction_cache use the canonical slug
derived from canonical_name, not the raw input.

### The slug alias table

Canonicalization solves writes, but the pre-check still uses the raw input slug. Without
a mapping, "Hilt" will always miss the cache even after Gemini has already confirmed and
stored "Hilton Paris Opera".
Solution: a slug_aliases table maps raw_slug → canonical_slug. After every Gemini call,
the raw input slug is written to slug_aliases pointing to the canonical slug. On subsequent
requests, the pre-check hits slug_aliases first, resolves to the canonical slug, and returns
cached data — no Gemini call needed. This scales to any number of users because the alias
lookup is a single primary key read.

### Pre-check flow (with alias resolution)

1. Build raw_slug from user input
2. Check slug_aliases for raw_slug → canonical_slug mapping
3. If alias exists: check ai_attraction_cache[canonical_slug] → HIT: return immediately
4. If no alias or cache expired: call Gemini with canonical_name in response schema
6. Build canonical_slug from canonical_name
6b. Check ai_attraction_cache[canonical_slug] — if already cached (different raw input, same place): store alias + return
7a. Upsert places (canonical_slug, canonical_name, stable fields)
7b. Insert ai_attraction_cache (canonical_slug, fresh fields, TTL 24h)
8. Insert slug_aliases (raw_slug → canonical_slug)
9. Return result

### Why not fuzzy search on the places table instead?

A prefix/ILIKE query on places.name for partial input is ambiguous — "hilt" matches
"Hilton", "Hilton Garden Inn", "Hilton Prague" etc. Without knowing user intent, you cannot
confidently select one result and skip enrichment. The alias table avoids this entirely
by recording exactly what the user meant after Gemini confirmed it.

## Current working features

- POST /ai/enrich — unified enrichment endpoint for five item types
  - Accepted item_type values: attraction, restaurant, hotel, transport, activity
  - Request body: { name, destination, item_type }
  - Flow: build raw_slug → resolve slug_aliases → check ai_attraction_cache → (hit) fetch places + return merged / (miss) Tavily search → Gemini → upsert places (stable) + upsert ai_attraction_cache (fresh, TTL 24h) → store slug alias → return
  - Client disconnect detection: backend races enrichment against request.is_disconnected() poll (100ms); cancels the asyncio task and returns 499 if client drops connection mid-flight. Does NOT await after cancel — is_disconnected() blocks indefinitely on live connections on fast (cache hit) paths.
  - Files: /backend/app/services/ai_enrichment.py, /backend/app/routes/ai.py
  - Model: set via AI_MODEL in .env
  - Per-type response fields:
    - attraction: description, opening_hours, price_range, tips
    - restaurant: description, cuisine, price_range, opening_hours, reservation_tips
    - hotel: description, amenities, check_in_time, price_range, booking_tips
    - transport: description, schedule, price_range, booking_tips
    - activity: description, duration, price_range, booking_tips, tips

- Places table + autocomplete — permanent knowledge base for places, powers autocomplete
  - GET /places/autocomplete?q=&destination=&item_type= — substring match on name, up to 10 results
  - places table: slug (canonical), item_type, name, destination, description, location, image_url — no TTL, never expires
  - slug_aliases table: raw_slug → canonical_slug mapping written after every Gemini call; enables cache hits for partial/misspelled input without re-calling Gemini
  - Files: /backend/app/services/places.py, /backend/app/routes/places.py

- Plans CRUD — create, read, list, update, delete travel plans
  - Routes: POST /plans (201), GET /plans/{id}, GET /plans?owner_id=, PATCH /plans/{id}, DELETE /plans/{id}
  - Files: /backend/app/routes/plans.py, /backend/app/services/plans.py
  - model_dump(mode="json") required on all Pydantic date fields before passing to supabase-py

- Itinerary — day and item management for a plan
  - Response models: PlanItemResponse, PlanDayWithItemsResponse — defined in /backend/app/schemas/responses.py
  - Day routes (prefix /plans, tag itinerary): POST /{plan_id}/days/initialize (idempotent), GET /{plan_id}/days, POST /{plan_id}/days (201), DELETE /{plan_id}/days/{day_id} (204)
  - Item routes: POST /{plan_id}/days/{day_id}/items (201), PATCH /{plan_id}/items/{item_id} (notes update), DELETE /{plan_id}/items/{item_id} (204)
  - Files: /backend/app/routes/plan_days.py, /backend/app/routes/plan_items.py, /backend/app/services/plan_days.py, /backend/app/services/plan_items.py
  - initialize_days is idempotent — checks for existing days first; creates from date_from/date_to range or a single Day 1 if no dates
  - item_type validated against VALID_ITEM_TYPES from app/constants.py on create
