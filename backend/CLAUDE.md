# Backend — Conventions & Architecture

## Conventions

- FastAPI with `async def` for all routes.
- All routes in `app/routes/`, one file per domain; route handlers named `{action}_{noun}_route` (e.g., `create_plan_route`, `autocomplete_places_route`).
- All business logic in `app/services/`, organized by domain: `ai/`, `places/`, `plans/`, `users/`, `social/`, `storage/`, `collab/`.
- Supabase client: import `get_supabase_client()` from `app/db.py` — never call `create_client()` directly; variable always named `supabase` in service files.
- Shared constants and shared validators in `app/constants.py` — `VALID_ITEM_TYPES` and `validate_item_type()` live here; import from there, never duplicate.
- Shared LLM utilities in `app/services/ai/llm.py` — `call_structured[ModelT](feature, schema, prompt, temperature, max_tokens)` is the single entry point. Never reimplement or hand-parse LLM output.
- Shared Pydantic response models for AI in `app/services/ai/schemas.py` — `EnrichmentResponse`, `SuggestionsResponse`, `TransportResponse` etc. All LLM calls use `.with_structured_output(...)`.
- Shared enrichment orchestrator: `app/services/ai/enrichment.py` — `get_place_data(name, destination, item_type)` is the single entry point; never reimplement inline.
- Pydantic schemas in `app/schemas/`, one file per domain. Request models prefixed by domain (`PlanCreate`, `DestinationCreate`). Response models end in `Response` (`PlanResponse`, `AiSuggestionItemResponse`). All route handlers must declare a typed return annotation.
- `item_type` validation: call `validate_item_type()` from `app/constants.py` via a `@field_validator` on the schema — never validate inline in route handlers.
- Config: `pydantic_settings.BaseSettings` in `app/config.py`. **All AI-related env vars are required** (`AI_MODEL`, `FALLBACK_AI_MODEL`, `OLLAMA_MODEL`, `OLLAMA_BASE_URL`, `OLLAMA_KEEP_ALIVE`, `OLLAMA_NUM_CTX`, `OLLAMA_REASONING`, and the three per-feature chains `AI_PROVIDER_CHAIN_ENRICH`, `AI_PROVIDER_CHAIN_SUGGESTIONS`, `AI_PROVIDER_CHAIN_TRANSPORT`). No global `AI_PROVIDER_CHAIN`. Never add defaults — documented in `.env.example` only.
- Services return `None` for not-found; route handlers raise `HTTPException(404)` — never raise HTTP exceptions from service files.
- Error pattern in routes: `ValueError → 422`, uncaught `Exception → 500` with `logger.exception()`.
- Router tags: one distinct tag per route file — `"plans"`, `"days"`, `"items"`, `"destinations"`, `"places"`, `"ai"`, `"users"`, `"social"`, `"storage"`, `"internal"`.
- Type hints: `X | None` union syntax (Python 3.10+) — never `Optional[X]`.
- No underscore-prefixed names — module privacy is enforced by not importing, not by naming convention.
- `model_dump(mode="json")` required on Pydantic date fields before passing to supabase-py.
- `.limit(1).execute()` for single-row queries — not `.maybe_single()`.
- Supabase is accessed via `service_role` key (bypasses RLS intentionally).
- Background cache cleanup: `app/services/places/cleanup.py` — `start_cache_cleanup()` called in `main.py` on startup; runs every 6 hours.

## Streaming

- SSE endpoints: `/ai/suggestions/stream`, `/ai/enrich/stream`, `/ai/transport-suggestions/stream`.
- Use `fastapi.responses.StreamingResponse` with `text/event-stream`.
- Yield `event: <name>\ndata: <json>\n\n` frames from a generator. Handle client disconnect via `request.is_disconnected()`.

## Database

- Supabase (PostgreSQL) — schema at `/supabase/schema.sql` (v2, single-file source of truth).
- RLS enabled with positive policies on all frontend-readable tables. `ai_attraction_cache`, `slug_aliases`, `plan_destination_days` are backend-only (service_role bypasses RLS).
- `yjs_state` in `plans` is a BYTEA blob — Hocuspocus is the only writer. FastAPI reads it only in `/internal/collab/seed` and the materializer.

## Collaboration

- `collab/` Node service runs Hocuspocus. FastAPI exposes three internal endpoints for it:
  - `POST /internal/collab/authorize` — JWT → `(user_id, role)` resolution, shared-secret-guarded.
  - `POST /internal/collab/changed` — debounce signal for the materializer.
  - `GET /internal/collab/seed?plan_id=…` — builds base64 `Y.Doc.toUpdate()` from relational on cold load.
- Materializer lives in `app/services/collab/materializer.py`, runs as a FastAPI background task per plan, debounced 2-5s after last change signal.

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

- Three required env vars, each a comma-separated provider list: `AI_PROVIDER_CHAIN_ENRICH`, `AI_PROVIDER_CHAIN_SUGGESTIONS`, `AI_PROVIDER_CHAIN_TRANSPORT`.
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
| Transport suggestions (`/ai/transport-suggestions/*`) | `routes/ai.py` | `services/ai/transport.py` |
| User preferences | `routes/users.py` | `services/users/preferences.py` |
| Friends | `routes/social.py` | `services/social/friends.py` |
| Invites | `routes/social.py` | `services/social/invites.py` |
| Comments / reactions / ratings / activity | `routes/social.py` | `services/social/{comments,reactions,ratings,activity}.py` |
| Storage signed URLs | `routes/storage.py` | `services/storage/signed.py` |
| Collab internal | `routes/collab.py` | `services/collab/{authorize,seed,materializer}.py` |
