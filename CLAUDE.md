# Ajmo — Collaborative Travel Planning App

## What this app does

Users create travel plans, invite friends, and collaboratively edit itineraries in real time.
AI enriches plan items with live data (description, price, hours) using RAG via web search + LLM.

## Monorepo structure

- /frontend — Next.js app (App Router), TypeScript, Tailwind, Shadcn/UI
- /backend — FastAPI (Python), handles REST API + AI logic
- /supabase/schema.sql — database schema
- /CLAUDE.md — this file
- /frontend/CLAUDE.md — frontend-specific conventions and features
- /backend/CLAUDE.md — backend-specific conventions, AI/RAG architecture, and features

## Running the app

- Frontend: `cd frontend && npm run dev` (runs on localhost:3000)
- Backend: `cd backend && .venv\Scripts\activate && uvicorn main:app --reload` (runs on localhost:8000)

## What NOT to do

- Never put SUPABASE_SERVICE_ROLE_KEY or AI keys in frontend code or .env.local
- Never install new npm packages without checking if Shadcn already has the component
- Never modify Supabase RLS policies without flagging it first
- Never use the pages/ router in Next.js
- Never modify places table records from the frontend — backend only
- Never touch yjs_state directly — only y-websocket writes it
