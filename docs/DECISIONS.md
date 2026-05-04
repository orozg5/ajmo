# Decisions (ADR-style)

One entry per non-obvious decision. Date in ISO format. Update when reversed.

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

## 2026-04-19 — @hey-api/openapi-ts for type sync

**Context.** Hand-typed API interfaces drift from FastAPI response models.

**Decision.** Generate TS + Zod + TanStack Query hooks from `/openapi.json` on every build; CI fails on drift.

**Rejected.** orval (less active), openapi-typescript alone (no query hooks), hand-maintained Zod.

**Tripwire.** If generated client becomes unreadable, pin to a version and regenerate only on schema changes.

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
