# Ajmo — Collaborative Travel Planning

Ajmo is a real-time collaborative travel planner. Users create trips, invite
friends, and co-edit itineraries together live — while AI enriches every stop
with descriptions, prices, and opening hours using RAG over web search.

> Master thesis project. The full thesis (Croatian) is in [`thesis/`](thesis/).

## Features

- **Real-time collaborative itineraries** — multiple people edit the same plan
  simultaneously, powered by Yjs CRDTs over a Hocuspocus WebSocket server.
  Presence/awareness shows who is editing what.
- **AI-enriched plan items** — a RAG pipeline (Tavily web search + LLM with
  structured output) fills in each place's description, price range, opening
  hours, and other metadata. A two-layer cache keeps stable facts permanent and
  volatile facts fresh for 24h.
- **AI suggestions** — the app proposes relevant attractions, hotels, and
  activities for each destination, streamed over Server-Sent Events.
- **Multi-city transport** — cross-city routing from live public-transit data
  (Transitous/MOTIS), driving routes (FOSSGIS OSRM), and a flight-time
  estimator — no LLM guessing for travel times.
- **Offline / local-first** — plans mirror to IndexedDB, so edits keep working
  when the connection drops and replay automatically on reconnect.
- **Social layer** — friends, plan invites, roles, comments, likes, ratings,
  and an activity feed.
- **Auth** — Supabase Auth with email/password and OAuth.

## Tech stack

| Layer           | Technology                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------- |
| Frontend        | Next.js 15 (App Router), TypeScript, Tailwind CSS v4, Shadcn/UI, React Query, Zustand        |
| Realtime        | Yjs, Hocuspocus (Node WebSocket server), y-indexeddb                                         |
| Backend         | FastAPI (Python), Pydantic, async httpx                                                      |
| Database / Auth | Supabase (PostgreSQL + Auth + Storage, RLS)                                                  |
| AI / RAG        | LangChain structured output, Tavily search, pluggable LLM providers (Ollama / Gemini / Groq) |
| Maps & transit  | MapLibre GL, Transitous (MOTIS), FOSSGIS OSRM, Pexels (images)                               |

## Monorepo structure

```
/
├── frontend/        Next.js 15 app (UI, App Router, Yjs client)
├── backend/         FastAPI REST API + AI/RAG logic
├── collab/          Hocuspocus Yjs WebSocket server
├── supabase/
│   └── schema.sql   Database schema (single-file source of truth)
└── thesis/          Master thesis (PDF)
```

## Architecture highlights

- **Source of truth is contextual.** While a plan is open, the Y.Doc is
  authoritative and Hocuspocus persists it to `plans.yjs_state`. At rest, the
  relational tables are authoritative — a debounced backend materializer diffs
  Yjs against the relational schema and upserts on idle.
- **RAG with a two-layer cache.** Stable place facts live permanently in
  `places`; volatile facts (prices, hours) live in a 24h cache. Slug
  canonicalization deduplicates lookups across variant names.
- **Never hand-parse LLM output.** Every AI call uses structured output against
  a Pydantic model, with per-feature provider chains and quota-based fallback.

## Running locally

Prerequisites: Node.js, Python 3.10+, a Supabase project, and the required API
keys (see each service's `.env.example`).

```bash
# Frontend — http://localhost:3000
cd frontend && npm install && npm run dev

# Backend — http://localhost:8000
cd backend && python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload

# Collab server — ws://localhost:1234 (required for live itinerary editing)
cd collab && npm install && npm run dev
```

Apply the database schema from `supabase/schema.sql` to your Supabase project.

## License

Academic / master thesis project.
