# Backend — Conventions & Architecture

## Conventions

- FastAPI with `async def` for all routes
- All routes in `app/routes/`, one file per domain; route handlers named `{action}_{noun}_route` (e.g., `create_plan_route`, `autocomplete_places_route`)
- All business logic in `app/services/`, organized by domain: `ai/`, `places/`, `plans/`, `users/`
- Supabase client: import `get_supabase_client()` from `app/db.py` — never call `create_client()` directly; variable always named `supabase` in service files
- Shared constants and shared validators in `app/constants.py` — `VALID_ITEM_TYPES` and `validate_item_type()` live here; import from there, never duplicate
- Shared LLM utilities in `app/services/ai/llm.py` — never re-implement inline
- Shared enrichment orchestrator: `app/services/ai/enrichment.py` — `get_place_data(name, destination, item_type)` is the single entry point; never re-implement inline
- Pydantic schemas in `app/schemas/`, one file per domain. Request models prefixed by domain (`PlanCreate`, `DestinationCreate`). Response models end in `Response` (`PlanResponse`, `AiSuggestionItemResponse`). All route handlers must declare a typed return annotation.
- `item_type` validation: call `validate_item_type()` from `app/constants.py` via a `@field_validator` on the schema — never validate inline in route handlers
- Config: `pydantic_settings.BaseSettings` in `app/config.py`; required fields raise `ValidationError` at startup; optional fields default to `None`; `CORS_ORIGINS` required as JSON array in `.env`
- Services return `None` for not-found; route handlers raise `HTTPException(404)` — never raise HTTP exceptions from service files
- Error pattern in routes: `ValueError → 422`, uncaught `Exception → 500` with `logger.exception()`
- Router tags: one distinct tag per route file — `"plans"`, `"days"`, `"items"`, `"destinations"`, `"places"`, `"ai"`, `"users"`
- Type hints: `X | None` union syntax (Python 3.10+) — never `Optional[X]`
- No underscore-prefixed names — module privacy is enforced by not importing, not by naming convention
- `model_dump(mode="json")` required on Pydantic date fields before passing to supabase-py
- `.limit(1).execute()` for single-row queries — not `.maybe_single()` (supabase-py returns `None` for the entire result on no match)
- Supabase is accessed via `service_role` key (bypasses RLS intentionally)
- Background cache cleanup: `app/services/places/cleanup.py` — `start_cache_cleanup()` called in `main.py` on startup; runs every 6 hours
- All new service/route files must follow the `supabase-service-pattern` skill

## Database

- Supabase (PostgreSQL) — schema at `/supabase/schema.sql`
- RLS enabled on all tables; AI cache tables and `places` are backend-only (service_role bypasses RLS)
- `yjs_state` in `plans` is a BYTEA blob — never write it directly; only y-websocket writes it

## Real-time collaboration

- Yjs CRDT — y-websocket server manages one room per plan; on room close it flushes binary state to `plans.yjs_state`

## AI / RAG — two-layer cache

Enrichment data has two distinct lifecycles, so it's split across two tables:

**Layer 1 — `places` table (permanent, no TTL)**
Stable fields: name, destination, item_type, description, location, image_url. Populated on first enrichment, never expires. Powers autocomplete globally — once any user enriches a place, all subsequent users get instant autocomplete results.

**Layer 2 — `ai_attraction_cache` (TTL 24h)**
Volatile fields: price_range, opening_hours, tips, etc. Re-fetched via web search + LLM on cache miss. Linked to `places` by the same slug key.

### Canonicalization and slug aliases

Raw input (`"Hilt"`) can't be used as a cache key — it won't match `"hilton-paris-opera-hotel"`. Solution:

1. On a cache miss, the LLM returns a `canonical_name` (official full name).
2. All writes use a slug derived from `canonical_name`, not raw input.
3. A `slug_aliases` table maps raw_slug → canonical_slug. After every LLM call, the raw input slug is written there. Subsequent requests resolve the alias and return cached data without calling the LLM.

**Pre-check flow:**
1. Build `raw_slug` from input → check `slug_aliases` → resolve to `canonical_slug`
2. Cache hit on `ai_attraction_cache[canonical_slug]` → return immediately
3. Cache miss → Tavily search + LLM → upsert `places` + `ai_attraction_cache` (24h TTL) + `slug_aliases`

### LLM provider chain

Primary: Google Gemini (`AI_MODEL` env var). Fallback: Groq (`GROQ_API_KEY` + `FALLBACK_AI_MODEL`). Chain order via `AI_PROVIDER_CHAIN` env var (default: `"ollama,gemini,groq"`). `is_quota_error()` in `llm.py` detects quota/rate-limit signals (429, RESOURCE_EXHAUSTED, RATE_LIMIT, QUOTA) and triggers automatic fallback.

### LLM output coercion

After parsing LLM JSON, list fields (`tips`, `amenities`) are coerced to `list[str]` and all other fields to `str`. This prevents 500s when the LLM returns an array for a scalar field.

## Features

| Feature | Route file | Service file |
|---|---|---|
| Plans CRUD | `routes/plans.py` | `services/plans/crud.py` |
| Itinerary days | `routes/plan_days.py` | `services/plans/days.py` |
| Itinerary items | `routes/plan_items.py` | `services/plans/items.py` |
| Plan destinations | `routes/plan_destinations.py` | `services/plans/destinations.py` |
| Place autocomplete | `routes/places.py` | `services/places/repository.py` |
| AI enrichment (`/ai/enrich`, `/ai/enrich-batch`) | `routes/ai.py` | `services/ai/enrichment.py` |
| AI suggestions (`/ai/suggestions`, `/ai/suggestions/next`) | `routes/ai.py` | `services/ai/suggestions.py` |
| Transport suggestions (`/ai/transport-suggestions/*`) | `routes/ai.py` | `services/ai/transport.py` |
| User preferences | `routes/users.py` | `services/users/preferences.py` |
