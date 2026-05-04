# AI Pipeline

## Provider routing (per-feature)

| Feature                | Typical prod chain            | Dev            |
|------------------------|-------------------------------|----------------|
| `autocomplete`         | SQL-only (`places`)           | —              |
| `enrich`               | Gemini 2.5 Flash → Groq 70B   | Ollama         |
| `suggestions`          | Gemini 2.5 Flash → Groq 70B   | Ollama         |
| `suggestions_next`     | Gemini 2.5 Flash → Groq 70B   | Ollama         |
| `transport`            | Groq Llama-3.1-8B-Instant     | Ollama         |
| `transport_cross_city` | Groq Llama-3.1-8B-Instant     | Ollama         |
| `summary` (future)     | Gemini 2.5 Flash              | —              |

Three required env vars drive this — `AI_PROVIDER_CHAIN_ENRICH`, `AI_PROVIDER_CHAIN_SUGGESTIONS`, `AI_PROVIDER_CHAIN_TRANSPORT`. Each is a comma-separated provider list, resolved per call by `chain_for_feature(feature)`. There is **no global `AI_PROVIDER_CHAIN` fallback** — unknown feature names raise `ValueError`, and missing envs fail `Settings()` validation at boot. Dev points all three at `ollama`; prod flips them to cloud providers.

## Dev latency tuning (Ollama-only)

In dev the pipeline is tuned for a single local model serving every feature, one-shot, no hidden CoT:

- `OLLAMA_MODEL=nemotron-3-nano:4b` (user-fixed; don't swap without measuring).
- `OLLAMA_KEEP_ALIVE=30m` — model stays resident; cold-load cost is paid once per dev session.
- `OLLAMA_NUM_CTX=4096` — tight context window; every prompt in this pipeline fits comfortably.
- `OLLAMA_REASONING=false` — disables thinking/CoT tokens on reasoning-capable models.
- `num_predict` per feature: enrich `1024`, suggestions `2048`, transport `1024` — hard caps on generated length (mapped from `max_tokens` in `call_structured`).
- Tavily `search_depth="basic"` by default; `"advanced"` only for hotels or a post-miss retry.
- Speculative prefetch on autocomplete hover warms the 24h cache before selection (most prefetches hit `ai_attraction_cache` — free).

These dials live in `backend/app/config.py` (`OLLAMA_*` vars) and `backend/app/services/ai/llm.py:build_llm`. Gemini and Groq retain their native token caps in the same function.

## Structured output

Every LLM call uses `llm.with_structured_output(PydanticModel)` via `bind_structured()` in `backend/app/services/ai/llm.py`. No `parse_llm_json`, no markdown-fence cleanup.

For Ollama, `bind_structured()` picks `method="json_mode"` (simple `format="json"` constraint) and appends `PydanticOutputParser.get_format_instructions()` to the prompt. The default `method="json_schema"` (grammar-constrained generation) is unreliable for several Ollama model families (Nemotron_h emits YAML-like prose and bypasses the schema entirely). Gemini and Groq use the default tool-calling path, which is reliable — unchanged. See 2026-04-20 ADR "Ollama json_mode over json_schema for structured output".

### Schemas (`backend/app/services/ai/schemas.py`)

```python
class EnrichmentResponse(BaseModel):
    canonical_name: str
    description: str
    location: str
    image_url: str | None
    price_range: str | None
    opening_hours: str | None
    tips: list[str]
    # ...per-item-type extensions

class SuggestionItem(BaseModel):
    name: str
    item_type: Literal["attraction","restaurant","hotel","transport","activity"]
    destination_city: str | None
    one_line: str | None        # max_length=60
    price_hint: str | None

class SuggestionsResponse(BaseModel):
    suggestions: list[SuggestionItem]

class TransportOption(BaseModel):
    name: str
    one_line: str   # e.g. "3h 30min · ~$89 · Direct"
    price_hint: str | None

class TransportSuggestion(BaseModel):
    pair_index: int
    scope: Literal["same_day", "same_day_cross_city", "cross_city"]
    options: list[TransportOption] = Field(min_length=2, max_length=4)

class TransportResponse(BaseModel):
    suggestions: list[TransportSuggestion]
```

Scope validator on `TransportSuggestion`:
- `cross_city` / `same_day_cross_city`: options must not include any mode in `INTERCITY_FORBIDDEN` = `{walk, metro, city bus, rideshare, uber, lyft, bolt, tram}`. Enforced via a Pydantic `model_validator`; no prose "CRITICAL:" preamble.
- `same_day` (within-city): no mode restriction; the prompt just advises walk/metro/bus for short distances.

## Streaming (SSE)

Endpoints that stream:

- `GET /ai/suggestions/stream?plan_id=…` — each yielded suggestion becomes an `event: suggestion` frame.
- `GET /ai/enrich/stream?name=…&destination=…&item_type=…` — progressive fields as they're materialized from the LLM.
- `GET /ai/transport-suggestions/stream?plan_id=…&day_id=…` — each pair's options streamed separately.

Frontend uses `EventSource` (or `fetch` + reader when auth headers are needed). Fallback to blocking variants (`/ai/suggestions`, `/ai/transport-suggestions/day`, etc.) when SSE is unavailable — e.g. proxies that strip chunked responses. Streams terminate with `event: done` or `event: error`.

Streaming is powered by `stream_structured(feature, schema, prompt, temperature, max_tokens)` in `backend/app/services/ai/llm.py`, which wraps `structured_llm.astream(prompt)`. Mid-stream provider fallback is not supported — once a stream begins it is committed to its provider.

## Caching (two layers, unchanged)

### Layer 1 — `places` (permanent)

Stable fields: `name, destination, item_type, description, location, image_url, lat, lng, timezone, categories`. Populated on first enrichment, never expires.

### Layer 2 — `ai_attraction_cache` (24h TTL)

Volatile fields per item type (price_range, opening_hours, amenities, check_in_time, schedule, duration). Linked to `places` by slug.

### Canonicalization

1. Build `raw_slug` from input → check `slug_aliases` → resolve to `canonical_slug`.
2. Cache hit on `ai_attraction_cache[canonical_slug]` → return immediately (pure SQL, sub-10ms).
3. Cache miss → Tavily search + LLM → upsert `places` + `ai_attraction_cache` + `slug_aliases`.

## Tavily tuning

- `search_depth="basic"` default.
- `search_depth="advanced"` for `item_type == "hotel"` or post-cache-miss retry.
- `max_results=5` standard; `max_results=8` for hotels.

## Speculative enrichment

On autocomplete dropdown hover (`onMouseEnter` with 150ms dwell), the frontend prefetches `/ai/enrich?name=…&destination=…&item_type=…` via React Query `queryClient.prefetchQuery`. Most prefetches hit the cache (free) and keep the UI instant.

## Temperature + token caps

| Feature       | Temperature | max_output_tokens |
|---------------|-------------|-------------------|
| enrich        | 0.0         | 1024              |
| suggestions   | 0.5         | 2048              |
| transport     | 0.3         | 1024              |

## Transport pair semantics

### Same-day (within a day)

Walk the day's items sorted by `sort_key`. Emit a pair at every adjacency. Tag:
- `same_day` — both items share `destination_id`.
- `same_day_cross_city` — items have different (or null) `destination_id`.

### Cross-day cross-city

Sort destinations by `MIN(day_number) FROM plan_destination_days` then `sort_order`. For each consecutive destination pair (A, B): pair = `(lastOf(A), firstOf(B))`. Empty-city sentinel items use `id=None` but a stable city-name-based `pair_key`.

### Coverage markers

On add, the frontend writes:
- `ai_data.same_day_pair = "{src_id}->{dst_id}"` for same-day transport items.
- `ai_data.cross_city_pair = "{src_id}->{dst_id}"` or `"{src_city}->{dst_city}"` for cross-city.

Backend excludes covered pairs on subsequent fetches.

### Cache invalidation

When reading `plans.transport_suggestions`:
- Drop cached pairs whose source/dest item_id is now a transport item.
- Drop cached pairs not present in the recomputed expected set.
- Generate LLM responses only for the new pairs.
- Write back the merged result.
