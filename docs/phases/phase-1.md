# Phase 1 — AI pipeline fix + transport bug fix

**Exit bar**: all LLM calls go through `.with_structured_output(PydanticModel)`; transport bugs in `docs/AUDIT.md` §2.2 individually verified fixed; speculative prefetch visible in devtools; `AI_*` envs have no defaults.

## In scope

### Backend — structured-output rebuild

- [x] `backend/app/services/ai/schemas.py` (new) — Pydantic models: `EnrichmentResponse`, `SuggestionsResponse`, `SuggestionItem`, `TransportResponse`, `TransportSuggestion` (with `Literal["same_day","same_day_cross_city","cross_city"]` scope + per-scope validator), `TransportOption`.
- [x] `backend/app/services/ai/llm.py` — replace `call_llm_with_fallback` with `call_structured[ModelT](feature, schema, prompt, temperature, max_tokens)`. Delete `parse_llm_json`, `strip_markdown_fences`.
- [x] Per-feature provider chains are the single source of truth: `AI_PROVIDER_CHAIN_ENRICH`, `AI_PROVIDER_CHAIN_SUGGESTIONS`, `AI_PROVIDER_CHAIN_TRANSPORT`, each **required** (no defaults). No global `AI_PROVIDER_CHAIN`.
- [x] Token caps + temps: `enrich` T=0 / 1024 tok; `suggestions` T=0.5 / 2048 tok; `transport` T=0.3 / 1024 tok.

### Speed tuning (dev, Ollama-only)

Dev runs one provider (Ollama) everywhere; cloud chains stay available for prod. The tuning dials below are baked into `build_llm()` for Ollama and exposed as required env vars.

| Knob | Value | Where | Why |
|---|---|---|---|
| Provider chain | `ollama` for each of the three per-feature envs | `.env` | One-hop in dev, no fallback latency |
| Model | `nemotron-3-nano:4b` | `OLLAMA_MODEL` | User-specified |
| Reasoning | off | `OLLAMA_REASONING=false` → passed as `reasoning=False` to `ChatOllama` | Disables hidden CoT tokens |
| Keep-alive | `30m` | `OLLAMA_KEEP_ALIVE=30m` | Model resident across dev requests |
| Context window | `4096` | `OLLAMA_NUM_CTX=4096` | Tight; prompts are well under |
| Output cap | per feature: 1024 / 2048 / 1024 | `max_tokens` in `call_structured`, maps to `num_predict` | Hard cap on generated length |
| Temperature | per feature: 0.0 / 0.5 / 0.3 | `temperature` in `call_structured` | Matches enrich/suggest/transport needs |
| Tavily depth | `basic` default; `advanced` only for hotels or a post-miss retry | `search_item(..., deep=...)` | Shaves search latency on common paths |
| Speculative prefetch | autocomplete `onMouseEnter` + 150ms dwell → `prefetchQuery('enrich', …)` | `ItemSearch.tsx` | Warms 24h cache before the user selects |

Prod flips `AI_PROVIDER_CHAIN_*` envs to cloud providers (e.g. `gemini,groq`); code paths are unchanged.

### Enrichment

- [x] `backend/app/services/ai/enrichment.py` — rebuild around `.with_structured_output(EnrichmentResponse)`. Drop `LIST_FIELDS` coercion shim. Preserve the 9-step cache flow verbatim.
- [x] Tavily: `search_depth="advanced"` for `item_type == "hotel"` or post-cache-miss retry; `"basic"` otherwise.
- [x] SSE variant `GET /ai/enrich/stream?name=…&destination=…&item_type=…` yielding progressive fields.

### Suggestions

- [x] `backend/app/services/ai/suggestions.py` — structured output via `SuggestionsResponse`.
- [x] SSE variant `GET /ai/suggestions/stream?plan_id=…` — each `SuggestionItem` as an `event: suggestion` frame.

### Transport — correctness rebuild

- [x] Replace `build_same_day_pairs` with a **day-walk pair builder**: walk items in a day sorted by `sort_order` (Phase 3 flips to `sort_key`), emit a pair at every adjacency, tag `same_day` when both items share `destination_id`, `same_day_cross_city` otherwise.
- [x] Sort cross-city destinations by `MIN(day_number) FROM plan_destination_days`, tie-broken by `sort_order`. Never by `sort_order` alone.
- [x] Unified `pair_key(src, dst) -> str` — id-based when both items real, city-name-based when either is a sentinel. No more `None->None` collisions.
- [x] Persist same-day dismissals via `ai_data.same_day_pair = "{src_id}->{dst_id}"` on transport items. Backend excludes covered pairs on subsequent fetches.
- [x] `last_day_for_dest` / `first_day_for_dest` return `None` on unmapped destinations; callers skip + log (no silent plan-wide fallback).
- [x] Drop the `CRITICAL: ...` natural-language preamble; rely on schema validators (`INTERCITY_FORBIDDEN` set + `min_length=2, max_length=4`).
- [x] SSE variant `GET /ai/transport-suggestions/stream?plan_id=…&day_id=…` (omit `day_id` for cross-city scope).

### Frontend

- [x] `frontend/src/features/plans/hooks/useDayTransport.ts` — drop `dismissedPairKeys` in-memory set; rely on backend marker. Now writes `ai_data: { same_day_pair: pairKey } satisfies SameDayMarker` when the user accepts an option.
- [x] `frontend/src/features/plans/hooks/useCrossCityTransport.ts` — routed through generated client. `frontend/src/lib/api/generated-setup.ts` sets baseUrl from `NEXT_PUBLIC_API_URL` and installs a request interceptor that injects the Supabase bearer token.
- [x] Speculative prefetch on autocomplete `onMouseEnter` (150ms dwell) → `queryClient.prefetchQuery(['enrich', name, destination, itemType], …)` for the enrich endpoint. Cancelled on `onMouseLeave`.

### Smoke tests (pytest)

- [x] Rome→Naples same-day split: pair generated, scope=`same_day_cross_city`. (`test_same_day_cross_city_pair`)
- [x] A (days 3-5), B (days 1-2): generated pair is B→A not A→B. (`test_cross_city_ordering_by_min_day_number`)
- [x] Sentinel pair (empty city → city with items): stable cache key, no LLM re-invocation on second fetch. (`test_sentinel_pair_cache_stable`)
- [x] Mid-chain item removed: old pair evicted, new pair regenerated. (`test_mid_chain_item_removal_regenerates`)

## Out of scope

- UI redesign (Phase 2).
- Yjs / materializer / Hocuspocus (Phase 6).
- Maps, geocoding lat/lng backfill (Phase 4).
- `plan_items.sort_order` → `sort_key` fractional indexes (Phase 3).
- Prod provider routing (Gemini/Groq paths stay; prod `.env` flips chains back).

## Verification

- Grep for `parse_llm_json` / `strip_markdown_fences` / `LIST_FIELDS` / `call_llm_with_fallback` / `CRITICAL:` in `backend/app/services/ai/` → zero hits.
- Grep `AI_PROVIDER_CHAIN\b` in `backend/` and `docs/` → zero hits (only suffixed `_ENRICH`/`_SUGGESTIONS`/`_TRANSPORT` variants survive).
- `.env` / `.env.example` diff — no defaults for any `AI_*` or `OLLAMA_*` env var.
- Boot backend with a missing `AI_PROVIDER_CHAIN_ENRICH` → Pydantic `ValidationError` at startup, not silent boot.
- Manually hit `/ai/suggestions/stream` with `curl -N` — observe multiple SSE frames before close.
- Enrichment cache hit: `curl -w "%{time_total}\n"` twice against `/ai/enrich` — second call < 100ms.
- Run smoke tests, all green.
