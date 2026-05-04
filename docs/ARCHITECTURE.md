# Architecture

## System shape

```
┌─────────────────────┐    ┌──────────────────────┐    ┌────────────────────┐
│  Next.js (Vercel)   │◄──►│  FastAPI (container) │◄──►│  Supabase Postgres │
│  React 19 / App Rtr │    │  LangChain / Tavily  │    │  + Auth / Storage  │
└──────┬──────────────┘    └──────────┬───────────┘    └──────┬─────────────┘
       │                              │                       │
       │     y-websocket              │                       │
       ▼                              ▼                       ▼
┌─────────────────────┐    ┌──────────────────────┐    ┌────────────────────┐
│  Hocuspocus (Node)  │◄──►│  yjs_state (bytea)   │    │  Supabase Realtime │
│  collab/src/*.ts    │    │  on plans row        │    │  (comments, etc.)  │
└─────────────────────┘    └──────────────────────┘    └────────────────────┘
```

## Data flows

### AI enrichment (two-layer cache)

```
user types "Hilt"
  → raw_slug "hilt-paris-hotel"
  → slug_aliases lookup → canonical_slug "hilton-paris-opera-hotel"
  → ai_attraction_cache[canonical_slug]   ← hit? return.
  → Tavily (basic, or advanced for hotels)
  → LLM .with_structured_output(EnrichmentResponse)
  → upsert places (permanent)
  → upsert ai_attraction_cache (24h TTL)
  → upsert slug_aliases (raw → canonical)
  → geocode via Nominatim / Mapbox → write lat/lng to places
```

### Transport suggestion

```
day walk: sorted items per day → emit pair at every adjacency
  → tag pair as same_day | same_day_cross_city (when destination_id changes)
cross-day: destinations sorted by MIN(day_number) from plan_destination_days
  → emit pair (lastOf(A), firstOf(B)) for each consecutive pair
  → covered pairs excluded via ai_data.{same_day,cross_city}_pair markers
  → LLM .with_structured_output(TransportResponse) on uncovered pairs only
```

### Real-time edit (Phase 6)

```
browser A edits day title
  → Y.Map.set('title', v)                  — local Yjs ops
  → y-indexeddb persists immediately
  → y-websocket broadcasts to Hocuspocus
  → Hocuspocus applies, broadcasts to browser B
  → on 30s idle: Hocuspocus writes plans.yjs_state
  → FastAPI materializer (debounced 2-5s): diff Yjs → upsert plan_days
```

### Offline write (Phase 7)

```
browser offline
  → Yjs edit → y-indexeddb persisted
  → non-Yjs mutation (comment, rating) → queued in IndexedDB
browser online
  → y-websocket reconnects → CRDT merges
  → queued mutations replay through React Query onlineManager
```

## Services

| Service                | Location                  | Role                                          |
|------------------------|---------------------------|-----------------------------------------------|
| Frontend (App Router)  | `frontend/`               | UI, Yjs + React Query state                   |
| Backend (FastAPI)      | `backend/`                | REST + AI + SSE + materializer                |
| Collab (Hocuspocus)    | `collab/`                 | Yjs WebSocket server + Supabase JWT auth      |
| Database               | Supabase Postgres         | Relational at-rest + `yjs_state` BYTEA        |
| Auth                   | Supabase Auth             | Email/pw + Google OAuth                       |
| Storage                | Supabase Storage          | plan-covers, user-avatars buckets             |
| Realtime               | Supabase Realtime         | Comments + activity channel fanout            |
| LLM providers          | Gemini / Groq / Ollama    | Per-feature routing, see AI_PIPELINE.md       |
| Search                 | Tavily                    | Web search for enrichment                     |
| Maps / tiles           | MapLibre + MapTiler/OSM   | Rendering + pins + clustering                 |
| Routing                | Public OSRM               | Walking polylines                             |

## Key invariants

- Yjs is source of truth while a plan is open. Relational is source of truth at rest. Materializer bridges.
- `places.slug` + `places.item_type` is the unique key for canonical place identity.
- Backend owns all writes to `places`, `ai_attraction_cache`, `slug_aliases`, `plan_destination_days`. Frontend never writes these.
- `plans.yjs_state` is BYTEA, only written by Hocuspocus.
- Service-role key never leaves backend + collab processes.
