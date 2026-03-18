# Ajmo — Collaborative Travel Planning App

## What this app does

Users create travel plans, invite friends, and collaboratively edit itineraries in real time.
AI enriches plan items with live data (description, price, hours) using RAG via web search + LLM.

## Monorepo structure

- /frontend — Next.js app (App Router), TypeScript, Tailwind, Shadcn/UI
- /backend — FastAPI (Python), handles REST API + AI logic
- /CLAUDE.md — this file

## Frontend conventions

- Always use Shadcn/UI components: never use raw HTML for UI — always install and use the Shadcn component
- Tailwind for all styling, no CSS modules or styled-components
- App Router only — no pages/ directory
- Server components by default; use "use client" only when necessary (event handlers, hooks, Yjs)
- Supabase is queried directly via @supabase/ssr in Server Components and route handlers
- All calls to the FastAPI backend go through /frontend/src/lib/api.ts
- Server components use fetch() directly, client components use TanStack Query.

## Backend conventions

- FastAPI with async everywhere (async def for all routes)
- All routes go in /backend/app/routes/, one file per domain (plans.py, ai.py, users.py, etc.)
- All business logic goes in /backend/app/services/, never directly in route handlers
- Use python-dotenv to load .env — never hardcode keys
- Supabase is accessed via service_role key in backend (bypasses RLS intentionally)

## Database

- Supabase (PostgreSQL) — schema is in /supabase/schema.sql
- RLS is enabled on all tables — AI cache tables are backend-only (service_role bypasses RLS)
- yjs_state column in plans is a BYTEA blob — never modify it directly, only via y-websocket

## Real-time collaboration

- Yjs CRDT for conflict-free state — y-websocket server manages rooms (one per plan)
- On room close, y-websocket flushes binary CRDT state to plans.yjs_state
- Never write itinerary state directly to plan_items during a live session

## AI / RAG pattern

- When a plan item is added: backend checks ai_attraction_cache first (TTL 24h)
- Cache miss: call web search API → pass results to AI model → return structured JSON
- LLM: Google Gemini (GOOGLE_API_KEY in .env) - model name comes from AI_MODEL env variable, never hardcoded
- Suggestions: check ai_suggestions_cache (TTL 6h), keyed by hash(destination + preference tags)

## Current working features

- POST /ai/attraction — enriches an attraction with live data
  - Flow: cache check → Tavily search → Gemini → cache store (TTL 24h)
  - Files: /backend/app/services/ai_enrichment.py, /backend/app/routes/ai.py
  - Model: gemini-2.5-flash (set via AI_MODEL in .env)

## What NOT to do

- Never put SUPABASE_SERVICE_ROLE_KEY or AI keys in frontend code or .env.local
- Never install new npm packages without checking if Shadcn already has the component
- Never modify Supabase RLS policies without flagging it first
- Never use the pages/ router in Next.js

## Running the app

- Frontend: cd frontend && npm run dev (runs on localhost:3000)
- Backend: cd backend && .venv\Scripts\activate && uvicorn main:app --reload (runs on localhost:8000)
