# Decisions (ADR-style)

One entry per non-obvious decision. Date in ISO format. Update when reversed.

## 2026-05-06 — Yjs schema scoped to items + day notes

**Context.** Phase-6 brought up the question of how much of the plan to model in the Y.Doc. The original phase plan listed destinations, days, items, hotels, and destination_days — five tables to keep mirrored. That ballooned the materializer's reconciliation surface and tied owner-only operations (date-range changes via `EditPlanDialog`, destination CRUD, hotel-with-place-join queries) to CRDT plumbing.

**Decision.** Only `items` and `day_notes` live in the Y.Doc. The materializer reconciles `plan_items` (full upsert+delete) and updates `plan_days.notes` for day_ids that already exist. `plan_days` lifecycle, `plan_destinations`, and `plan_hotels` stay REST-driven.

**Rejected.**
- Mirror everything in Y.Doc — biggest blast radius if reconciliation is buggy; couples date-range UX to Yjs round-trip.
- Mirror items + hotels + day_notes — hotels carry joined `places.*` columns that the Y.Doc can't easily hold without duplicating place data.

**Tripwires.**
- If users complain that adding a hotel doesn't show up live for collaborators, migrate hotels to the Y.Doc (joined fields stay REST-fetched on demand).
- If owner date-range edits feel disconnected (other clients keep stale day list until reload), introduce a small Y.Doc "version" key that bumps on REST mutations and triggers a refetch.

## 2026-04-19 — Hocuspocus over Liveblocks

**Context.** Real-time collab requires a Yjs WebSocket server with auth, persistence, and role-based write-gating.

**Decision.** Use Hocuspocus self-hosted.

**Rejected.** Liveblocks (paid, proprietary), y-websocket standalone (no auth/RBAC), Supabase Realtime alone (awareness only, no CRDT).

**Tripwire.** If self-hosting Hocuspocus becomes a DevOps tax, evaluate Liveblocks free tier for presence + custom CRDT for docs.

## 2026-04-19 — MapLibre + OSM/MapTiler

**Context.** Need maps for pins + walking routes without vendor lock-in.

**Decision.** MapLibre GL JS + MapTiler free tier + OSRM public routing.

**Rejected.** Mapbox GL (token required, cost), Leaflet (no vector tiles, older feel), Google Maps (expensive, ToS friction).

**Tripwire.** If tile rate limits hit, upgrade MapTiler paid or host our own tile server.

**Superseded by 2026-04-20 (key-free map stack)** — user has no tokens and needs unconstrained request volume.

## 2026-04-20 — Ollama json_mode over json_schema for structured output

**Context.** LangChain's `with_structured_output(schema)` defaults to `method="json_schema"`, which binds Ollama's `format=<schema>` grammar-constraint. Several model families (Nemotron_h specifically — the dev default `nemotron-3-nano:4b` is in this family) ignore the bound schema and emit YAML-like bullet prose, causing a downstream `OutputParserException` that surfaces to the user as red `Invalid json output:` text in the UI. Reproduced directly against `nemotron-3-nano:4b`: with `format=<schema>` the model returns a markdown list; with the simpler `format="json"` constraint the model returns valid schema-matching JSON.

**Decision.** `backend/app/services/ai/llm.py:bind_structured()` branches on provider. For Ollama: `method="json_mode"` + append `PydanticOutputParser.get_format_instructions()` to the prompt. For Gemini/Groq: unchanged (tool-calling based structured output, reliable).

**Rejected.**
- Switch the dev model to a json_schema-compliant family (e.g. `llama3.2:3b`, `qwen2.5:3b`) — forces every dev to `ollama pull` an extra 2 GB and abandons the user's Nemotron choice.
- Custom retry-with-raw-JSON-extraction fallback — hides the failure mode behind brittle string parsing and violates the "never hand-parse LLM output" rule in `backend/CLAUDE.md`.
- `method="json_mode"` without injected schema instructions — the model emits valid JSON but with arbitrary keys; required fields routinely missed.

**Tripwires.**
1. If we ever swap to a family with a well-tested Ollama GBNF schema path (e.g. `llama3.2`, `mistral`), re-measure and drop the branch.
2. Gemini/Groq paths are deliberately untouched — don't "unify" the branch unless a future provider also turns out to mishandle its default schema path.
3. `PydanticOutputParser.get_format_instructions()` emits the full JSON schema into the prompt; keep schemas compact. Bloated Field descriptions push token usage up and risk exceeding `OLLAMA_NUM_CTX`.

## 2026-04-20 — Key-free map stack: OpenFreeMap + Photon + Valhalla + timezonefinder

**Context.** Phase 4 needs geocoding, vector tiles, walking routes, and timezone lookup with zero API keys and the highest possible request volume. Every keyed provider (Mapbox, MapTiler, Google, Stadia, Thunderforest, AWS Location, Azure Maps) is ruled out by the no-token constraint.

**Decision.** All-OSM, all-keyless stack:
- **Tiles:** OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`) — MapLibre-native, OpenMapTiles schema, no key, no hard rate limit.
- **Geocoding primary:** Photon (`https://photon.komoot.io/api`) — autocomplete-friendly, no key.
- **Geocoding fallback:** Nominatim (`https://nominatim.openstreetmap.org/search`) — backend-only; 1 req/s policy cap; backfill script throttles at 1100ms.
- **Timezones:** `timezonefinder==6.5.2` Python package — offline polygon lookup; IANA zone names; module-level `TimezoneFinder(in_memory=True)` singleton.
- **Walking routes:** FOSSGIS Valhalla (`https://valhalla1.openstreetmap.de/route`) — `costing: "pedestrian"`; polyline6 response; straight-line fallback on any 5xx.
- **LLM coords ignored:** `EnrichmentResponse` dropped its `lat`/`lng`/`timezone` fields; the prompt no longer asks for them. Only the geocoder writes coordinates — LLMs hallucinate lat/lng too often to trust.

**Rejected.**
- Mapbox / MapTiler / Stadia / Thunderforest / Google — all keyed.
- Leaflet — raster only, no vector tiles, older feel.
- OSRM public demo — no official SLA; Valhalla's FOSSGIS instance is the better-maintained free walking router.
- Photon-only geocoding — single maintainer, no fallback leaves us dark.
- Letting the LLM return lat/lng — coordinate hallucinations drift whole blocks; geocoding against a canonical name is strictly safer.

**Tripwires.**
1. All four public endpoints are single-maintainer or volunteer-run. Monitor error rates; be ready to flip.
2. Nominatim usage policy requires a descriptive `User-Agent` with contact info and caps 1 req/s — never call it from per-keystroke code paths.
3. `timezonefinder` ships ~50MB of polygon data. Load once at module import. Pin the version.
4. Valhalla has no SLA. On 5xx / 4xx, fall back to a straight-line polyline (dashed, muted color) with no retry loop.
5. Attribution is mandatory: OSM + OpenFreeMap + Photon + Valhalla credits must appear on every rendered map. Single MapLibre `AttributionControl`.

**Migration paths (if public endpoints degrade).**
- Tiles → self-host a Protomaps `pmtiles` file behind a CDN, swap `MAP_STYLE_URL`.
- Photon → self-host Photon container (OSM data + ES 7), keep Nominatim fallback intact.
- Valhalla → self-host the Valhalla container with an OSM PBF extract for target regions.
- Nominatim → self-host Nominatim container with the same OSM extract.

All four migrations are container-only — no code change beyond env URLs.

**Partially superseded by 2026-05-04 (Nominatim-only geocoder, Wikipedia-only image).**

## 2026-05-04 — One source per enrichment field: Nominatim, Wikipedia, no LLM image

**Context.** Enrichment was asking the LLM to extract `image_url` from Tavily search snippets, but Tavily's `results[].content` is a text pipeline — image URLs were either hallucinated by the LLM or copied from broken/expired CDN paths. Wikipedia's REST summary endpoint already worked as an "override on success" but quietly fell back to the LLM's value when Wikipedia missed. Separately, Photon (primary) + Nominatim (fallback) was a redundant geocoder pair: Photon needs a custom post-filter (`photon_pick_best`) because it lacks a server-side `countrycodes` parameter, while Nominatim has both `countrycodes` and `viewbox` natively. Two providers for one job, no measurable benefit.

**Decision.** One trusted source per field, no fallback to less-reliable sources.
- **Image:** Wikipedia REST summary `thumbnail.source` is the only source. `EnrichmentResponse.image_url` removed; the prompt no longer mentions image_url; the merge logic stores `wiki_image` directly (None becomes None, not LLM-filled).
- **Geocoder:** Nominatim only. `photon_lookup`, `photon_pick_best`, `PROVIDERS` dict, and `GeocodeResult.source` deleted. `geocode()` calls Nominatim directly.
- **Env config:** `GEOCODER_PRIMARY` and `GEOCODER_FALLBACK` removed (per the "one setting, one env var" principle when only one provider remains). `GEOCODER_USER_AGENT` kept — Nominatim and Wikipedia both want a descriptive UA.

**Rejected.**
- Keep Photon as a "performance" fallback when Nominatim hits 1 req/s — enrichment is cache-miss only, never per-keystroke; the rate limit is irrelevant.
- Add a separate `IMAGE_SOURCE` env to swap providers — premature flexibility; Wikipedia is the only sensible source today.
- Keep `image_url` in `EnrichmentResponse` and just ignore it server-side — wastes tokens on every cache-miss enrichment and risks a future merge accidentally re-introducing the field.

**Tripwires.**
1. If Wikipedia REST starts returning low-quality thumbnails or rate-limiting, evaluate Wikidata's `P18` claim or commons.wikimedia.org image search before reintroducing the LLM path.
2. If Nominatim's 1 req/s ever bottlenecks enrichment latency (it shouldn't — single call per cache miss), look at the Nominatim self-host migration path from the 2026-04-20 entry.
3. Coordinates are still geocoder-only. Don't reintroduce `lat`/`lng` to `EnrichmentResponse` under any pretext — same reasoning as 2026-04-20.

## 2026-05-05 — Pexels replaces Wikipedia; strict one-source-per-field

**Context.** Wikipedia REST `thumbnail.source` (the 2026-05-04 image source) only returns images for notable subjects. Restaurants, small hotels, and most non-landmark POIs missed entirely → `image_url` saved as NULL → frontend rendered placeholder forever. Wikipedia coords were also being used as a Nominatim fallback, violating the one-source-per-field rule. Separately, the cache-miss branch of `get_place_data` always re-called Wikipedia + Nominatim even when `places` already had a row for the canonical slug — wasted external API calls every 24h per active attraction, and (because `upsert_place` was secretly UPDATE-on-conflict) risked clobbering good data with NULL when the second call failed. Nominatim runtime had no rate limiter (only the backfill script throttled), `geocode_with_fallbacks` built `"{location}, {destination}"` even when location already ended in destination ("Paris, France, Paris, France"), `plan_items.ai_data` snapshotted enrichment so a future `places.lat/lng` backfill never reached the existing items, and `useMapState` silently filtered NULL-coord items.

**Decision.** Single consolidated cleanup:
- **Image source:** Pexels API (`api.pexels.com/v1/search?query={name}+{destination}`). Free, generous rate limits, search-based — always returns *something* visually relevant. New required env `PEXELS_API_KEY` (no default). Wikipedia removed entirely.
- **Coords:** Nominatim only. Wikipedia coord fallback dropped — NULL is acceptable when Nominatim misses (better than a wrong pin).
- **Cache miss with existing place:** if `places` already has a canonical_slug row (cache expired but stable fields known), only refresh the volatile cache; skip Pexels and Nominatim.
- **Nominatim rate limit:** module-level `aiolimiter.AsyncLimiter(1, 1)` wraps every `geocode()` call.
- **Query dedup:** `geocode_with_fallbacks` strips trailing destination from `location_query` before building the first variant.
- **`upsert_place`:** now passes `ignore_duplicates=True` to match its docstring.
- **`plan_items.place_id`:** new FK to `places(id) on delete set null`. Read paths JOIN `places` and hydrate stable fields (lat/lng/image_url/description/location/timezone/categories) into `ai_data` at read time. Future backfills of `places` automatically heal existing items.
- **Frontend feedback:** `ItemCard` swaps `MapPin` → `MapPinOff` (with tooltip) when coordinates are missing.
- **Autocomplete:** `ILIKE '{q}%'` (prefix) instead of `'%{q}%'` (substring).

**Rejected.**
- **Unsplash** — higher visual polish but demo key capped at 50 req/hr; production approval is friction the project doesn't need yet.
- **Pixabay** — generous limits but stockier/lower-quality images and some watermarked content.
- **Foursquare Places photos** — actual venue photos when available, but no coverage for non-Foursquare POIs and a more complex two-step API.
- **Keep Wikipedia + add a second image source** — violates the one-source-per-field rule the user established 2026-05-04.
- **Drop `plan_items.sort_order`** — was on the original cleanup list, but `transport_pairs.py`, `crossCityPayload.ts`, and `DayView` cross-city slot positioning all use it. Deferred to a dedicated PR with its own migration of those three.

**Tripwires.**
1. Pexels images are not actual venue photos — they're search-relevant stock. If the UI starts feeling generic, evaluate Foursquare/Geoapify for venue-specific photos.
2. The existing-place short-circuit assumes `places` is the source of truth for stable fields. If we ever need to refresh `description` or `image_url` on cache expiry, this short-circuit needs an opt-in flag.
3. `upsert_place` with `ignore_duplicates=True` returns no row on conflict; the wrapper does a follow-up SELECT to return the existing row to callers. If that double-roundtrip becomes a bottleneck, switch to a stored procedure.
4. The `place_id` FK is forward-declared (added via `alter table` after `places` is created later in `schema.sql`). Don't reorder schema.sql without verifying the constraint still resolves.
5. Backfilling `place_id` on existing `plan_items` rows is operator-driven (no script provided yet) — for fresh dev DBs the destructive `schema.sql` rewrite is fine; for any longer-lived deployment, write a one-shot.

## 2026-05-06 — Transport leaves the LLM (deterministic API orchestrator)

**Context.** Phase 1 routed cross-city and same-day transport through `services/ai/transport_llm.py` with `Groq Llama-3.1-8B-Instant`. Six issues kept biting:
1. Hallucinated mode options (e.g. "Maglev" between two non-Asian cities, ferries in landlocked pairs).
2. Hallucinated durations and prices — `one_line` strings like "3h 30min · ~$89 · Direct" looked authoritative but had no source.
3. Same-day routing still required real polylines for the map; the LLM never returned geometry, so we had to call OSRM after the LLM anyway.
4. SSE latency was dominated by the LLM call even on cache miss; OSRM and Transitous together resolve in well under a second.
5. The cache invalidation logic in `services/ai/transport.py` had to track an LLM-shaped `TransportOption` alongside actual route geometry written into `plan_items.ai_data` on insert. Two shapes for one concept.
6. `INTERCITY_FORBIDDEN` and `min_length=2` validators existed only because the LLM kept proposing walk/tram for inter-city pairs. Deleting the LLM deletes both classes of error.

**Decision.** Replace the LLM with deterministic API orchestration. No LLM call anywhere in the transport path.

- **Cross-city orchestrator** (`backend/app/services/transport/cross_city.py`): per pair, fans out five lookups in parallel:
  | Mode    | Source                            | Skip when           |
  |---------|-----------------------------------|---------------------|
  | drive   | OSRM driving (FOSSGIS)            | haversine > 1500 km |
  | train   | Transitous (RAIL family)          | (always tried)      |
  | bus     | Transitous (BUS, COACH)           | haversine > 1500 km |
  | ferry   | Transitous (FERRY)                | (always tried)      |
  | flight  | haversine + cruise + 2 h overhead | haversine < 200 km  |
  Sentinel cities (no place_id) are geocoded through Nominatim. Pairs that fail to resolve drop with a warning.
- **New same-day endpoints** (no auth-token call to a third-party from the browser):
  - `POST /transit/osrm-route` → `services/transport/osrm.py:get_route` (proxies FOSSGIS OSRM walk/bike/drive — centralizes the User-Agent + retry policy + sidesteps browser DNS quirks against `routing.openstreetmap.de`).
  - `POST /transit/directions` → `services/transit/directions.py:get_transit_directions` (Transitous MOTIS plan endpoint, free, no API key).
- **Frontend split:** `useDayTransport` deleted. Replaced by `useSameDayTransportOptions` (parallel mode probes per inline-bar pair) and `useSameDayTransportInsert` (writes the chosen mode as a transport plan item). Cross-city stream consumer (`useCrossCityTransport`) unchanged in shape — it now consumes deterministic option dicts instead of LLM `TransportOption` rows.
- **Schemas left in place:** `TransportOption`, `TransportSuggestion`, `TransportResponse` still exist in `services/ai/schemas.py` so importers compile; nothing produces them via an LLM. `INTERCITY_FORBIDDEN` and the scope validator are functionally dead code; keep one release for safety.
- **Env:** `AI_PROVIDER_CHAIN_TRANSPORT` removed. Two per-feature chains remain (`_ENRICH`, `_SUGGESTIONS`).
- **Lifespan:** `main.py` now closes three lazy HTTP clients on shutdown (`close_geocoder_client`, `close_transit_client`, `close_osrm_client`).

**Rejected.**
- **Google Directions everywhere** — needs a paid API key; the project's "no token" rule rules it out, and the latency win over Transitous + OSRM is small.
- **Mapbox Directions / Routing** — same key-required problem.
- **Keep the LLM as a "creative" mode advisor** (e.g. "did you consider taking the night train?") — would re-introduce hallucinated modes and add an LLM dependency back into the critical path. The UI already lists every realistic mode.
- **Mid-pipeline LLM fallback** when OSRM/Transitous return empty — defeats the determinism gain. Empty results mean "no route exists"; the UI is honest about that.
- **Polyline normalization in the frontend** — both Transitous (Google polyline, configurable precision) and OSRM (GeoJSON) speak different formats; centralizing the decode in `services/transit/directions.py` (Transitous) and accepting OSRM's GeoJSON directly keeps the frontend dumb.

**Tripwires.**
1. **Transitous coverage** is uneven outside the EU — emerging-market public transit may return 204. Surface this as a hidden-button rather than a misleading "no transit" message.
2. **FOSSGIS OSRM throttling** — caps at ~1 req/sec/host. The orchestrator only fires once per pair; if usage grows we'll need to self-host an OSRM container before that bites.
3. **Flight estimator is heuristic** — `is_estimate=True` is set on every flight option so the UI must label it visibly (badge / chip). Don't propagate the duration to billing/confirmation flows as if it were a real itinerary.
4. **Polyline precision** — MOTIS v2+ defaults to `precision=6`; some legs may report `precision=5`. `decode_polyline(encoded, precision=...)` reads `legGeometry.precision` from the response — don't hardcode.
5. **`TransportSuggestion` schemas** — still in `services/ai/schemas.py` for legacy compile, but no producer. If they linger past the next phase, delete them and the `INTERCITY_FORBIDDEN` set with one PR.

## 2026-04-19 — @hey-api/openapi-ts for type sync

**Context.** Hand-typed API interfaces drift from FastAPI response models.

**Decision.** Generate TS + Zod + TanStack Query hooks from `/openapi.json` on every build; CI fails on drift.

**Rejected.** orval (less active), openapi-typescript alone (no query hooks), hand-maintained Zod.

**Tripwire.** If generated client becomes unreadable, pin to a version and regenerate only on schema changes.

**Reversed by 2026-05-05 — generated client never adopted; deleted.**

## 2026-05-05 — Reverse openapi-ts; hand-typed API shims stay

**Context.** The 2026-04-19 ADR adopted `@hey-api/openapi-ts` to generate a TanStack-Query-aware SDK from `/openapi.json` into `frontend/src/lib/api/generated/`. Six months later, no feature code imports from the generated SDK. The hand-typed shims in `frontend/src/lib/api/{plans,ai,...}.ts` are what actually power the app. Only two files referenced `generated/`: `client.ts` (used the auto-generated SSE parser) and `generatedSetup.ts` (configured a client nothing called). The user has never run `npm run gen:api` and explicitly does not want the directory.

**Decision.** Delete the generated client and the surrounding scaffolding.
- `frontend/src/lib/api/generated/` — deleted (entire subtree).
- `frontend/src/lib/api/generatedSetup.ts` — deleted (side-effect was setting baseUrl + auth on a client nothing used).
- `frontend/openapi-ts.config.ts` — deleted.
- `frontend/package.json` — `"gen:api": "openapi-ts"` script removed; `@hey-api/openapi-ts` devDependency removed.
- `frontend/src/lib/api/client.ts` — `apiSse` rewritten as a small inline `fetch + ReadableStream` SSE parser (~50 lines). No external SSE dep.
- `frontend/src/app/providers.tsx` — `import "@/lib/api/generatedSetup"` side-effect import removed.

**Rejected.**
- **Keep generated/ as opt-in for future use** — dead code rots; if we want it back later, regenerate then.
- **Migrate every shim to the generated SDK** — large rewrite for a problem (drift) that hasn't actually bitten in six months.
- **Keep just `serverSentEvents.gen.ts` under a non-generated name** — 242 lines of generality we don't need; the inline parser handles our `event: <name>\ndata: <json>\n\n` format directly.

**Tripwires.**
1. Drift between FastAPI Pydantic models and the hand-typed shims (`plans.ts`, `ai.ts`) is now a manual concern. If a backend schema change ships without updating the shim, runtime errors at the network boundary. Convention: when editing `app/schemas/*.py`, grep `frontend/src/lib/api/` for the type name and update it in the same PR.
2. The inline SSE parser is intentionally minimal — it handles `event:`/`data:` lines and `\n\n` frame boundaries only. If we ever need `id:`, `retry:`, or comment lines, extend `apiSse` rather than reintroducing a generated client.
3. If drift becomes a real source of bugs, the right next step is probably `openapi-typescript` (types only, no SDK or query hooks) — much smaller surface than the previous `@hey-api/openapi-ts` adoption.

## 2026-04-19 — Yjs as source of truth while editing

**Context.** Collaborative editing + offline support need conflict-free merges.

**Decision.** Yjs doc holds itinerary state during editing. Materializer writes to relational on idle. Relational is source of truth at rest.

**Rejected.** "Postgres always, Yjs for awareness only" (simpler, but no offline editing). "Yjs everywhere, Postgres as cold storage" (kills SQL-driven features like AI suggestions).

**Tripwire.** If materializer lag causes user-visible staleness in AI responses, reduce debounce window or promote to synchronous.

## 2026-04-19 — Destructive schema rewrite

**Context.** Schema v2 adds enums, tables, indexes, and RLS policies. No production data exists.

**Decision.** `supabase/schema.sql` is a single file that drops + creates from scratch.

**Rejected.** Forward migrations (sqitch, atlas, supabase-migrations) — premature while data is dev-only.

**Tripwire.** If any prod data is created, this decision is reversed and we switch to forward migrations before the next schema change.

## 2026-04-19 — Fix existing code before UI polish

**Context.** User explicitly prefers audit-and-fix over greenfield addition.

**Decision.** Phase 1 = AI pipeline + transport correctness. Phase 2 = UI rebuild.

**Rejected.** Original plan had UI polish last. Moved forward per user preference.

**Tripwire.** If Phase 1 drags past 2 sessions without shipping, split transport fixes from AI refit and ship one at a time.

## 2026-04-19 — Social ships before real-time collab

**Context.** Real-time collab (Phase 6) is the heaviest chunk. Social (Phase 5) is useful on its own.

**Decision.** Social ships first; collab follows.

**Rejected.** Original plan had collab first. Swapped per user preference.

**Tripwire.** If social features depend on presence UI that doesn't exist yet, ship a static-avatar placeholder and backfill once Phase 6 lands.

## 2026-04-19 — Per-feature LLM routing

**Context.** One global provider chain forces a tiny structured transport prompt to pay Gemini latency.

**Decision.** Each AI surface picks its own provider order: `enrich` Gemini→Groq→Ollama, `suggestions` Gemini→Groq, `transport` Groq-8B→Gemini.

**Rejected.** Single global chain (current). Per-call provider override (confusing).

**Tripwire.** If Groq-8B quality regresses transport output, promote Gemini Flash to primary for transport.
