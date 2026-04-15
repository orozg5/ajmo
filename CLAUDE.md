# Ajmo — Collaborative Travel Planning App

## What this app does

Users create travel plans, invite friends, and collaboratively edit itineraries in real time.
AI enriches plan items with live data (description, price, hours) using RAG via web search + LLM.

## Monorepo structure

```
/
├── frontend/           Next.js 15 (App Router), TypeScript, Tailwind, Shadcn/UI
├── backend/            FastAPI (Python), REST API + AI/RAG logic
├── supabase/
│   └── schema.sql      Database schema
├── frontend/CLAUDE.md  Frontend conventions and architecture
└── backend/CLAUDE.md   Backend conventions and AI architecture
```

## Running the app

- Frontend: `cd frontend && npm run dev` (localhost:3000)
- Backend: `cd backend && .venv\Scripts\activate && uvicorn main:app --reload` (localhost:8000)

## Non-obvious file placements

- `frontend/src/middleware.ts` — Next.js requires middleware at exactly `src/middleware.ts` (or project-root `middleware.ts`). This is the required location for Next.js to auto-detect and run it on every request.
- `frontend/src/app/auth/callback/route.ts` — Next.js App Router OAuth callback handler. After Supabase redirects back with `?code=`, this route exchanges the code for a session via `exchangeCodeForSession(code)`. Must live at `/auth/callback` to match the redirect URL registered in Supabase.
- `frontend/src/app/(auth)/` — Route group (parentheses = no URL segment). Groups `/login` and `/register` under a shared unauthenticated layout without affecting the URL path.

## Hard constraints

- Never put `SUPABASE_SERVICE_ROLE_KEY` or AI API keys in frontend code or `.env.local`
- Never install npm packages without checking if Shadcn already has the component
- Never modify Supabase RLS policies without flagging it first
- Never use the Next.js `pages/` router
- Never modify `places` table records from the frontend — backend only
- Never write to `yjs_state` directly — only y-websocket writes it
