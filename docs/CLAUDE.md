# docs/ — Documentation conventions

## Layout

- `AUDIT.md` — standing critique of the current code. Update in place when audited issues are fixed; don't delete old bullets — add a "fixed" note.
- `ARCHITECTURE.md` — high-level system diagram + data flows.
- `DECISIONS.md` — ADR-style log. One entry per decision: context, decision, rejected alternatives, tripwires.
- `DATA_MODEL.md` — table-by-table reference; tracks `supabase/schema.sql`.
- `UI_DESIGN.md` — design tokens, typography scale, motion grammar, ASCII wireframes.
- `COLLAB.md` — Yjs doc schema + Hocuspocus auth + materializer contract.
- `AI_PIPELINE.md` — provider routing, structured-output schemas, cache layers, transport pair semantics.
- `OFFLINE.md` — service worker strategies, IndexedDB layout, reconnect semantics.
- `phases/phase-0.md` … `phases/phase-9.md` — per-phase scope, checklist, verification, out-of-scope. These are the working checklists driven by `PROGRESS.md`.

## Writing style

- Terse. Bullets over paragraphs. One sentence per bullet.
- No implementation code inside docs — link to `backend/app/...` or `frontend/src/...` paths instead.
- Every decision doc leads with "why" before "what".
- When a doc is updated, note the date in the file if the change is non-obvious. Otherwise rely on `git log`.
