# Audit — what's wrong with the current code

This is the standing critique. Update in place: when an item is fixed, append `→ fixed in <phase / file>` rather than deleting.

## AI pipeline is not using LangChain the standard way

- **Hand-rolled JSON parsing.** `backend/app/services/ai/llm.py:37-54` defines `parse_llm_json` + `strip_markdown_fences`. `enrichment.py`, `suggestions.py`, `transport.py` all depend on it. Should be `llm.with_structured_output(PydanticModel)`. The `LIST_FIELDS` coercion shim in `enrichment.py` exists only because parses occasionally return lists for scalar fields — eliminated by schema validation. → fixed in Phase 1 (`llm.py` rewrite: `call_structured` / `stream_structured`; `enrichment.py` / `suggestions.py` / `transport.py` now use Pydantic schemas; `LIST_FIELDS` removed).
- **No per-feature model choice.** `call_llm_with_fallback` walks one global chain. Transport wants Groq 8B for latency; enrichment wants Gemini Flash for quality. Per-feature routing is the fix. → fixed in Phase 1 (three required env vars `AI_PROVIDER_CHAIN_ENRICH/_SUGGESTIONS/_TRANSPORT`; global `AI_PROVIDER_CHAIN` dropped; `chain_for_feature(feature)` raises on unknown feature).
- **Everything blocking.** No SSE streaming. Suggestions / enrichment wait for the full response. → fixed in Phase 1 (SSE routes `/ai/enrich/stream`, `/ai/suggestions/stream`, `/ai/transport-suggestions/stream`; blocking variants kept as proxy-compat fallback).
- **Prompts carry rules in prose** that could be schema fields. Token waste. → fixed in Phase 1 (transport's `CRITICAL:` preamble replaced by `TransportSuggestion` model validator + `INTERCITY_FORBIDDEN` set; suggestions prompt simplified; enrichment prompt drops JSON-shape instructions).
- **Hardcoded env defaults** in `backend/app/config.py`. → fixed in Phase 0.
- **Tavily always `basic`.** Hotels need `advanced`; non-hotels don't. → fixed in Phase 1 (`search_item(..., deep=False)` picks `advanced` for hotels or post-miss retry; `max_results=8` for hotels).
- **No prefetch.** Autocomplete hover is free prefetch opportunity; unused. → addressed in Phase 1 frontend work (`ItemSearch.tsx` `onMouseEnter` + 150ms dwell → `queryClient.prefetchQuery`).

## Transport logic is buggy

Targeted at `backend/app/services/ai/transport.py` + the two frontend hooks.

- **Same-day cross-destination transport doesn't exist.** `build_same_day_pairs:38-79` only pairs items sharing `destination_id`. Morning Rome → afternoon Naples on the same day never triggers. Cross-city endpoint is destination-level, not day-level, so it doesn't pick this up either. → fixed in Phase 1 (new `build_same_day_pairs` emits every adjacency and tags `scope="same_day_cross_city"` when destination_ids differ).
- **Destination ordering ignores `plan_destination_days`.** `build_cross_city_pairs:132-135` sorts by `sort_order` alone. If A is days 3-5 and B is days 1-2 but A has higher sort_order, the pair is A→B (backwards). Fix: sort by `MIN(day_number)` from `plan_destination_days`, tie-broken by `sort_order`. → fixed in Phase 1 (`build_cross_city_pairs` sorts by `first_day_for_dest` then `sort_order`; unmapped destinations sort last).
- **Sentinel pair cache collisions.** Empty-city sentinels use `id=None`. `cross_city_pair_key` falls back to city names; `cached_pair_keys` keys off `id->id` → `None->None` for every sentinel → no cache hits → LLM call on every request. → fixed in Phase 1 (unified `pair_key(src, dst)` → city-name-keyed when either id is None; paired with `suggestion_pair_key` for cache reads).
- **Same-day dismissals not persisted.** `useDayTransport.ts:43` keeps `dismissedPairKeys` in `useState`. Reload = lost. Backend has no same-day equivalent of `ai_data.cross_city_pair`. Need `ai_data.same_day_pair` marker. → backend side fixed in Phase 1 (`get_same_day_suggestions` / `stream_same_day_suggestions` read `ai_data.same_day_pair` to skip covered pairs); frontend write wiring is Phase 1 frontend work.
- **Silent day-range fallbacks.** `last_day_for_dest` / `first_day_for_dest` return plan-wide first/last when a destination has no `plan_destination_days` entry. Return `None`; let caller decide. → fixed in Phase 1 (both helpers now return `None`; `build_cross_city_pairs` logs + skips rather than falling back).
- **`sort_order=None` clumps at front** due to `i.get('sort_order') or 0` (`transport.py:130`). Latent — becomes a real bug once `sort_key` is introduced.
- **No concurrency guard** on the `read → mutate → write` of `plans.transport_suggestions`. Collaborative writes will clobber.
- **LLM rules in prose** (`transport.py:197-210`). "CRITICAL: for CROSS-CITY pairs..." belongs in a Pydantic schema with `Literal["same_day","cross_city"]` + per-scope validators. → fixed in Phase 1 (`TransportSuggestion.check_scope_option_compatibility` validator + `INTERCITY_FORBIDDEN` set in `schemas.py`; prose preamble dropped from `build_transport_prompt`).

## Schema + storage gaps

- No `lat/lng/timezone/categories` on `places` → maps impossible. → fixed in Phase 4 (columns already existed in `supabase/schema.sql:194-209`; enrichment now writes them via Photon/Nominatim geocoding + `timezonefinder`; `get_place_by_slug` selects them so cache hits carry coords into `EnrichedItem`).
- `plan_items.sort_order int` → needs to become `sort_key text` (fractional index) for conflict-free collaborative reorders.
- No `plan_hotels` table → hotels can't span nights.
- No `plan_days.notes`, `plan_comments`, `plan_item_reactions`, `plan_item_ratings`, `plan_activity`, `plan_invites`.
- `plans.is_public bool` → should be `visibility` enum (`private | link | friends | public`). → fixed in Phase 2 (schema + `PlanResponse.visibility` + frontend `PlanVisibility` + dashboard scope filter all aligned; `is_public` removed from API).
- Missing indexes on hot paths (`plan_items.plan_id/day_id/destination_id`, `plan_days.plan_id`, `plan_members.user_id`, `friendships.requester_id/addressee_id`).
- RLS enabled on most tables but zero policies — tolerable because backend uses `service_role`, but blocks direct-from-client reads (Realtime) and masks bugs.

## Frontend architecture drift

- Hand-typed API interfaces in `frontend/src/lib/api/*` mirror FastAPI models by hand → drift. Fix with `@hey-api/openapi-ts`.
- `usePlanItinerary` uses raw `useState` + ad-hoc optimistic updates, not React Query. Yjs cutover (Phase 6) is easier if React Query is consolidated first.
- `zod` transitive via `@hookform/resolvers`. Add as direct dep.
- Stock shadcn gray palette, no brand, no display font, no motion, no empty states, no toasts, no error boundaries. Home is `<div>Home</div>`. → fixed in Phase 2 (OKLCH tokens + Fraunces display font applied; `PageTransition` + framer hover lifts; `EmptyPlansState` with `CompassMark` SVG; Sonner toasts; `Home` replaced with `DashboardSections` — three scopes, skeletons, empty states).
- No Zustand stores yet; needed for UI state (presence, offline pill, map camera).
- No Supabase Storage wiring. `plans.cover_image_url` exists but nothing writes it. → fixed in Phase 2 (buckets + RLS in schema; `POST /storage/{plan-covers,user-avatars}/signed`; `useSignedUpload` hook; wizard Step 3 + `AvatarUploader` consume it; `cover_image_path`/`_url` persisted via `createPlan`).

## What's good (don't touch)

- Two-layer cache (`places` permanent + `ai_attraction_cache` 24h TTL) + `slug_aliases` canonicalization. Preserve verbatim.
- Service-layer discipline (`services/ai`, `services/places`, `services/plans`).
- `isAbortError`, `URLSearchParams`, PascalCase, no-underscore, `X | None` conventions.
- Supabase Auth + Google OAuth + JWKS decoding.
- Route group `(auth)` + `src/middleware.ts` wire-up.
