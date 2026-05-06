# Ajmo — Collaborative Travel Planning App

## What this app does

Users create travel plans, invite friends, and collaboratively edit itineraries in real time.
AI enriches plan items with live data (description, price, hours) using RAG via web search + LLM.

## Monorepo structure

```
/
├── frontend/               Next.js 15 (App Router), TypeScript, Tailwind, Shadcn/UI
├── backend/                FastAPI (Python), REST API + AI/RAG logic
├── collab/                 Hocuspocus Yjs WebSocket server (shipped Phase 6)
├── supabase/
│   └── schema.sql          Database schema (v2 source of truth, single file)
├── docs/                   Standing docs — audit, architecture, decisions, phase plans
├── PROGRESS.md             Phase tracker — check here first each session
├── CLAUDE.md               This file — repo-wide conventions
├── frontend/CLAUDE.md      Frontend conventions
├── backend/CLAUDE.md       Backend conventions
├── collab/CLAUDE.md        Collab service conventions
└── docs/CLAUDE.md          Doc style and file ownership
```

## Running the app

- Frontend: `cd frontend && npm run dev` (localhost:3000)
- Backend: `cd backend && .venv\Scripts\activate && uvicorn main:app --reload` (localhost:8000)
- Collab: `cd collab && npm run dev` (localhost:1234) — required for itinerary live editing

## Resume-across-sessions

- `PROGRESS.md` is the top-level phase tracker. Every session starts by reading it to find the first unchecked item.
- `docs/NAVIGATION.md` — map of the codebase; start here if you don't know where a file lives.
- `docs/APP_FLOW.md` — end-to-end user flows with code pointers.
- Each phase has a working doc at `docs/phases/phase-N.md` with scope + checklist + verification + out-of-scope.
- `docs/AUDIT.md` is a standing critique of the current code. Update in place when an audited issue is fixed — don't delete, annotate the fix in place.
- `docs/DECISIONS.md` is an ADR log. Add a new entry for each architectural decision with context, decision, rejected alternatives, tripwires.

## Non-obvious file placements

- `frontend/src/middleware.ts` — Next.js requires middleware at exactly `src/middleware.ts` (or project-root `middleware.ts`). This is the required location for Next.js to auto-detect and run it on every request.
- `frontend/src/app/auth/callback/route.ts` — Next.js App Router OAuth callback handler. After Supabase redirects back with `?code=`, this route exchanges the code for a session via `exchangeCodeForSession(code)`. Must live at `/auth/callback` to match the redirect URL registered in Supabase.
- `frontend/src/app/(auth)/` — Route group (parentheses = no URL segment). Groups `/login` and `/register` under a shared unauthenticated layout without affecting the URL path.

## Source-of-truth rules

- **While a plan is open**: Yjs is the source of truth. All itinerary edits write to the Y.Doc; Hocuspocus persists to `plans.yjs_state`.
- **At rest**: relational tables are the source of truth. A debounced backend materializer diffs Yjs against relational and upserts on idle.
- **Autocomplete / permanent knowledge**: `places` is the permanent cache. `ai_attraction_cache` is the 24h volatile cache. `slug_aliases` resolves raw → canonical slugs. All three are backend-only (service role).

## Hard constraints

- Never put `SUPABASE_SERVICE_ROLE_KEY` or AI API keys in frontend code or `.env.local`.
- Never install npm packages without checking if Shadcn already has the component.
- Never modify Supabase RLS policies without flagging it first.
- Never use the Next.js `pages/` router.
- Never modify `places` records from the frontend — backend only.
- Never write to `yjs_state` directly — only Hocuspocus (via `@hocuspocus/extension-database`) writes it. FastAPI may only read it (materializer + `/internal/collab/seed`).
- Y.Doc schema is `items + day_notes + likes + ratings + comments` (plus the `plan_meta` broadcast mirror). Hotels, destinations, and `plan_days` lifecycle stay REST-driven. Don't add another root key without an ADR — see ADR 2026-05-06 (revised: "Likes, ratings, comments move into Yjs").
- Never hand-parse LLM output — always use `.with_structured_output(PydanticModel)` in backend AI services.
- Never hardcode env var defaults in `backend/app/config.py` — every AI-related env var must be required and documented in `.env.example`.
- Never use underscore prefixes on any name, including "private" helpers.
