# Backend — Conventions & Architecture

## Conventions

- FastAPI with `async def` for all routes.
- All routes in `app/routes/`, one file per domain; route handlers named `{action}_{noun}_route` (e.g., `create_plan_route`, `autocomplete_places_route`).
- All business logic in `app/services/`, organized by domain: `ai/`, `places/`, `plans/`, `users/`, `social/`, `storage/`, `collab/`, `transit/` (Transitous public-transit MOTIS), `transport/` (FOSSGIS OSRM walk/bike/drive + haversine flight estimator).
- Supabase client: import `get_supabase_client()` from `app/db.py` — never call `create_client()` directly; variable always named `supabase` in service files.
- Shared constants and shared validators in `app/constants.py` — `VALID_ITEM_TYPES` and `validate_item_type()` live here; import from there, never duplicate.
- Shared LLM utilities in `app/services/ai/llm.py` — `call_structured[ModelT](feature, schema, prompt, temperature, max_tokens)` is the single entry point. Never reimplement or hand-parse LLM output.
- Shared Pydantic response models for AI in `app/services/ai/schemas.py` — `EnrichmentResponse`, `SuggestionsResponse` etc. All LLM calls use `.with_structured_output(...)`.
- Shared enrichment orchestrator: `app/services/ai/enrichment.py` — `get_place_data(name, destination, item_type)` is the single entry point; never reimplement inline.
- Pydantic schemas in `app/schemas/`, one file per domain. Request models prefixed by domain (`PlanCreate`, `DestinationCreate`, `DestinationUpdate`). Response models end in `Response` (`PlanResponse`, `AiSuggestionItemResponse`, `TransitDirectionsResponse`, `OsrmRouteResponse`). All route handlers must declare a typed return annotation.
- `item_type` validation: call `validate_item_type()` from `app/constants.py` via a `@field_validator` on the schema — never validate inline in route handlers.
- Config: `pydantic_settings.BaseSettings` in `app/config.py`. **All AI-related env vars are required** (`AI_MODEL`, `FALLBACK_AI_MODEL`, `OLLAMA_MODEL`, `OLLAMA_BASE_URL`, `OLLAMA_KEEP_ALIVE`, `OLLAMA_NUM_CTX`, `OLLAMA_REASONING`, `OLLAMA_REPEAT_PENALTY`, and the two per-feature chains `AI_PROVIDER_CHAIN_ENRICH`, `AI_PROVIDER_CHAIN_SUGGESTIONS`). No global `AI_PROVIDER_CHAIN`. Cross-city transport is not LLM-driven so has no chain. Image source is required: `PEXELS_API_KEY`. Geocoder/Transitous identity: `GEOCODER_USER_AGENT`. Collab service handshake requires `COLLAB_SHARED_SECRET` (matched with `secrets.compare_digest` on inbound `X-Collab-Secret` headers) and `YJS_IDLE_MS` (materializer debounce in milliseconds). Never add defaults — documented in `.env.example` only.
- Services return `None` for not-found; route handlers raise `HTTPException(404)` — never raise HTTP exceptions from service files.
- Error pattern in routes: `ValueError → 422`, uncaught `Exception → 500` with `logger.exception()`.
- Specialized errors: `services/plans/days.py:DateShrinkBlocked` (subclasses `ValueError`) is raised when a plan's date-range change would drop days that hold items; route handlers translate it to `409 Conflict`.
- Router tags: one distinct tag per route file — `"plans"`, `"days"`, `"items"`, `"destinations"`, `"places"`, `"ai"`, `"users"`, `"social"`, `"storage"`, `"transit"`, `"internal"`.
- Type hints: `X | None` union syntax (Python 3.10+) — never `Optional[X]`.
- No underscore-prefixed names — module privacy is enforced by not importing, not by naming convention.
- `model_dump(mode="json")` required on Pydantic date fields before passing to supabase-py.
- `.limit(1).execute()` for single-row queries — not `.maybe_single()`.
- Supabase is accessed via `service_role` key (bypasses RLS intentionally).
- Background cache cleanup: `app/services/places/cleanup.py` — `start_cache_cleanup()` called in `main.py` on startup; runs every 6 hours.
- Lazy HTTP-client teardown in `main.py` lifespan: `close_geocoder_client()`, `close_transit_client()`, `close_osrm_client()` — every backend-internal external HTTP client owns a module-level `httpx.AsyncClient` and an idempotent close hook registered here.
- Suggestions pipeline (`services/ai/suggestions.py`): `enrich_suggestion_metadata` returns `cached: bool` so the frontend can skip the background `/ai/enrich-batch` call for permanent-cache hits; `top_up_suggestions` keeps the strip at `TARGET_SUGGESTION_COUNT = 5` after dismissals.

## Streaming

- SSE endpoints: `/ai/suggestions/stream`, `/ai/enrich/stream`, `/ai/transport-suggestions/stream`. The transport stream is no longer LLM-driven — it streams cross-city pairs as the multi-source orchestrator (`services/transport/cross_city.py`) finishes each pair's parallel API fan-out.
- Use `fastapi.responses.StreamingResponse` with `text/event-stream`.
- Yield `event: <name>\ndata: <json>\n\n` frames from a generator. Handle client disconnect via `request.is_disconnected()`.

## Database

- Supabase (PostgreSQL) — schema at `/supabase/schema.sql` (v2, single-file source of truth).
- RLS enabled with positive policies on all frontend-readable tables. `ai_attraction_cache`, `slug_aliases`, `plan_destination_days` are backend-only (service_role bypasses RLS).
- `yjs_state` in `plans` is a BYTEA blob — Hocuspocus is the only writer. FastAPI reads it only in `/internal/collab/seed` and the materializer.

## Collaboration

- `collab/` Node service runs Hocuspocus. FastAPI exposes three internal endpoints for it, all guarded by the `X-Collab-Secret` header (matched with `secrets.compare_digest` against `settings.COLLAB_SHARED_SECRET`):
  - `POST /internal/collab/authorize` — JWT → `(user_id, role)` resolution. Role comes from `services/social/members.py:get_role` (owner via `plans.owner_id`, otherwise `plan_members.role`).
  - `POST /internal/collab/changed` — debounce signal; calls `services/collab/materializer.py:schedule(plan_id)` to (re)start the per-plan idle timer.
  - `GET /internal/collab/seed?plan_id=…` — builds base64 `Y.Doc.get_update()` from `plan_items` + `plan_days.notes` (no hotels/destinations) on cold load when `plans.yjs_state IS NULL`.
- Materializer lives in `app/services/collab/materializer.py`, per-plan `asyncio.Task` with `YJS_IDLE_MS` debounce (default 30s). On fire it decodes `yjs_state` with `pycrdt` and reconciles `plan_items` (full upsert+delete scoped by `plan_id`), `plan_days.notes` (UPDATE for day_ids already on the plan), `plan_item_reactions` filtered to `kind='like'` (insert/delete diff), `plan_item_ratings` (upsert + delete missing), and `plan_comments` (upsert by id; rows whose id disappears from the doc are deleted). Hotels, destinations, and the `plan_days` lifecycle stay REST-driven (ADR 2026-05-06 revised).
- `plans.yjs_state` is a BYTEA blob; `services/plans/crud.py:strip_yjs_state` filters it out of any Pydantic-serialized HTTP response.

## AI / RAG — two-layer cache (unchanged from v1)

**Layer 1 — `places` (permanent)**
Stable fields: `name`, `destination`, `item_type`, `description`, `location`, `image_url`, `lat`, `lng`, `timezone`, `categories`. Populated on first enrichment, never expires.

**Layer 2 — `ai_attraction_cache` (24h TTL)**
Volatile fields per item type (price_range, opening_hours, amenities, check_in_time, schedule, duration). Linked to `places` by slug.

### Canonicalization

1. Build `raw_slug` from input → check `slug_aliases` → resolve to `canonical_slug`.
2. Cache hit on `ai_attraction_cache[canonical_slug]` → return immediately.
3. Cache miss → Tavily search + LLM → upsert `places` + `ai_attraction_cache` + `slug_aliases`.

### LLM provider routing (per feature, env-driven)

- Two required env vars, each a comma-separated provider list: `AI_PROVIDER_CHAIN_ENRICH`, `AI_PROVIDER_CHAIN_SUGGESTIONS`. Cross-city transport is API-driven (OSRM + Transitous + haversine flight estimator) and registers no chain.
- No global fallback. Unknown feature names (typos in `call_structured(feature=...)`) raise `ValueError`; missing envs fail `Settings()` at boot.
- Dev default in `.env.example`: all three are `ollama`. Prod flips them to cloud chains (e.g. `gemini,groq`).
- Mid-chain fallback fires only on `is_quota_error()` (429, 503, RESOURCE_EXHAUSTED, RATE_LIMIT, QUOTA). Validation errors (Pydantic `ValidationError`) propagate immediately — we want schema mismatches visible, not masked.
- Streaming (`stream_structured`) commits to the first provider and does not fall back mid-stream.

### Tavily tuning

- `search_depth="basic"` default.
- `search_depth="advanced"` for `item_type == "hotel"` or post-cache-miss retry.
- `max_results=5` standard; `max_results=8` for hotels.

## Hard constraints

- Never hand-parse LLM output — always `.with_structured_output(PydanticModel)`. The `parse_llm_json` / `strip_markdown_fences` / `LIST_FIELDS` shims must stay deleted.
- Never hardcode defaults for AI env vars in `app/config.py` — user memory feedback flags this.
- Never write to `plans.yjs_state` from FastAPI — Hocuspocus is the only writer.
- Never mix service and route responsibilities — services return domain data, routes translate to HTTP.
- Never raise `HTTPException` from `app/services/*` — let routes translate.

## Features

| Feature | Route file | Service file |
|---|---|---|
| Plans CRUD | `routes/plans.py` | `services/plans/crud.py` |
| Itinerary days | `routes/plan_days.py` | `services/plans/days.py` |
| Itinerary items | `routes/plan_items.py` | `services/plans/items.py` |
| Plan hotels | `routes/plan_hotels.py` | `services/plans/hotels.py` |
| Batch reorder | `routes/plan_items.py` | `services/plans/items.py` |
| Plan destinations | `routes/plan_destinations.py` | `services/plans/destinations.py` |
| Place autocomplete | `routes/places.py` | `services/places/repository.py` |
| AI enrichment (`/ai/enrich`, `/ai/enrich/stream`, `/ai/enrich-batch`) | `routes/ai.py` | `services/ai/enrichment.py` |
| AI suggestions (`/ai/suggestions`, `/ai/suggestions/stream`, `/ai/suggestions/next`) | `routes/ai.py` | `services/ai/suggestions.py` |
| Transport suggestions (`/ai/transport-suggestions/cross-city`, `/ai/transport-suggestions/stream`) | `routes/ai.py` | `services/ai/transport.py` (cache + pair graph via `transport_pairs.py`) → `services/transport/cross_city.py` (multi-source orchestrator) → `services/transit/directions.py` (Transitous train/bus/ferry), `services/transport/osrm.py` (OSRM driving), `services/transport/flight_estimator.py` (haversine + cruise) |
| Same-day routing (`/transit/directions`, `/transit/osrm-route`) | `routes/transit.py` | `services/transit/directions.py` (Transitous public-transit), `services/transport/osrm.py` (FOSSGIS OSRM, walk/bike/drive profiles) |
| User preferences | `routes/users.py` | `services/users/preferences.py` |
| Profile / friend search | `routes/social.py` (`/social/users/search`) | `services/users/search.py` |
| Friends | `routes/social.py` (`friends_router`) | `services/social/friends.py` |
| Plan invites | `routes/social.py` (`plan_invites_router`, `invite_router`) | `services/social/invites.py` |
| Plan members + role resolution | `routes/social.py` (`plan_members_router`) | `services/social/members.py` (incl. `get_role`) |
| Storage signed URLs | `routes/storage.py` | `services/storage/signed.py` |
| Collab internal (`/internal/collab/{authorize,changed,seed}`) | `routes/collab.py` | `services/collab/{authorize,seed,materializer,schema}.py` |

**Phase 5 social**: comments, likes (only kind in product UI), ratings, and the activity feed all shipped 2026-05-06. Comments/likes/ratings live in the Y.Doc and are reconciled by the materializer; the REST endpoints in `routes/social.py` are kept as backend-only test surfaces. The activity feed is a regular REST resource backed by `services/social/activity.py:safe_record_activity` calls scattered across the writer services.
