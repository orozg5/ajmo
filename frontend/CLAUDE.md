# Frontend — Conventions & Architecture

## Directory structure

```
src/
├── app/                          Next.js App Router pages
│   ├── (auth)/                   Route group — login, register (shared layout, no URL segment)
│   ├── auth/callback/route.ts    OAuth code-exchange handler (not a page)
│   ├── plans/[id]/               Itinerary editor
│   ├── plans/new/                Plan creation wizard
│   ├── settings/                 Shared settings shell — layout.tsx + page.tsx (landing/redirect)
│   ├── settings/preferences/     User preferences
│   └── settings/profile/         Profile edit (Phase 2)
├── components/
│   ├── ui/                       Shadcn/UI primitives only — never put feature code here
│   ├── layout/                   AppShell, Header, Sidebar, ErrorBoundary
│   ├── brand/                    Logo and brand marks
│   └── theme/                    ThemeProvider, ThemeToggle, ThemedToaster
├── features/                     Feature-scoped components and hooks
│   ├── auth/components/          LoginForm (forwards ?next), RegisterForm, LogoutButton
│   ├── plans/components/         Itinerary UI — incl. PlanWorkspace (role-aware Yjs shell)
│   ├── plans/components/offline/ ConnectionStatusBadge + useConnectionToasts (online↔offline UI)
│   ├── plans/hooks/              Itinerary data hooks; itinerary + notes route through Y.Doc
│   ├── map/                      MapLibre components (Phase 4)
│   ├── social/                   Friends + invites + plan-members UI (Phase 5; comments/reactions/ratings deferred)
│   └── settings/                 components/ (PreferencesForm, ProfileForm, SettingsTabs) + constants.ts (interest/dietary/budget enums)
├── lib/
│   ├── api/
│   │   ├── client.ts             Runtime fetch wrapper (auth headers, error shaping, SSE parser)
│   │   ├── plans.ts, ai.ts, transit.ts, users.ts, social.ts  Hand-typed request functions per domain
│   │   └── index.ts              Barrel
│   ├── supabase/                 client.ts (browser) + server.ts (SSR) + profile.ts (RLS-scoped profile chrome fetch)
│   ├── yjs/                      Doc factory, Hocuspocus provider, mutations, React observer hooks (Phase 6)
│   ├── map/                      MapLibre init, style, marker helpers (Phase 4)
│   ├── offline/                  useOnlineStatus, useSyncState, React Query IndexedDB persister, per-plan persistence cleanup
│   └── utils.ts                  cn(), isAbortError()
└── stores/                       Zustand stores — UI state only
```

## State layering (strict)

- **Yjs** (via `lib/yjs/`) — collaborative itinerary state while a plan is open (shipped Phase 6, 2026-05-06). Y.Doc holds `items` (per-day `Y.Array<Y.Map>`), `day_notes` (`Y.Map<dayId, string>`), plus the social surfaces added 2026-05-06: `likes` (`Y.Map<itemId, Y.Map<userId, true>>`), `ratings` (`Y.Map<itemId, Y.Map<userId, number>>`), `comments` (`Y.Array<Y.Map>`). Awareness/presence (`focusedItemId`, `isTypingComment`, user profile chrome) rides on the Hocuspocus provider's `awareness` channel — see `lib/yjs/hooks.ts:useRemoteAwareness`, `features/plans/components/awareness/`, `docs/COLLAB.md`, and ADR 2026-05-06 (revised).
- **Zustand** (`stores/`) — UI-only client state: theme, offline pill, queued-writes badge, toast store, modal open/close.
- **React Query** (`@tanstack/react-query`) — server cache. Queries tagged `meta: { persist: true }` are persisted to IndexedDB via `@tanstack/query-async-storage-persister` on top of `idb-keyval` (key `ajmo:react-query-cache`, 24h `maxAge`); persistence is wired in `app/providers.tsx` and hydrates on client mount so the plan workspace paints from the last snapshot when offline. See `lib/offline/queryPersister.ts`.
- **React Hook Form + Zod** — form state; schemas colocated with the form.

## Auth pattern

- `lib/supabase/client.ts` — browser Supabase client (`createBrowserClient`).
- `lib/supabase/server.ts` — server Supabase client (`createServerClient` with cookie adapter); used in server components and route handlers.
- `middleware.ts` — validates the session on every request; redirects unauthenticated users to `/login`; must be at `src/middleware.ts` — Next.js will not detect it anywhere else.
- `app/auth/callback/route.ts` — receives the `?code=` param from Supabase OAuth redirect and calls `exchangeCodeForSession(code)` to set the session cookie.
- `app/(auth)/` — parentheses make this a route group: `/login` and `/register` share a layout without the segment appearing in the URL.

## Conventions

- Import order: `"use client"` directive → React → Next.js → third-party → `@/components/` → `@/lib/` → `@/features/` → `@/stores/`; blank line between each group.
- All imports use absolute `@/` paths — never relative `./Sibling` or `../hooks/Hook`.
- App Router only — no `pages/` directory.
- Server components by default; add `"use client"` only when the component needs event handlers, hooks, or browser APIs.
- Supabase is queried in server components via `@/lib/supabase/server` — never query Supabase directly from client components.
- All FastAPI calls go through `@/lib/api/` — hand-typed shims per domain (`plans.ts`, `ai.ts`, etc.) sitting on `client.ts`'s `apiFetch`/`apiSse`.
- Always use Shadcn/UI components — check `components/ui/` before installing a new package.
- Tailwind v4 for all styling — no CSS modules or styled-components.
- Component filenames must be PascalCase (`ItemSearch.tsx`, `CreatePlanWizard.tsx`) — never kebab-case.
- One component per file — never define more than one exported component in a file.
- Feature-specific code lives in `features/<feature>/components/` and `features/<feature>/hooks/`.
- Complex data-fetching logic (refs, effects, abort controllers) must be extracted to a hook in the same feature's `hooks/` folder.
- Build query strings with `URLSearchParams` — never manual string interpolation.
- Custom hooks must never expose raw React state setters (`setX`) — encapsulate mutations behind named action functions (`handleNameChange`, `handleSelect`).
- Hook interfaces: options type named `Use{HookName}Options`; return type named `Use{HookName}Return` (exported; always annotate the function return type explicitly).
- Abort error guard: use `isAbortError(error)` from `@/lib/utils` — never inline `(e as Error).name !== "AbortError"`.
- Display-layer label maps (e.g., `FIELD_LABELS`) must be module-level named constants with a comment marking them as intentionally configurable.
- No underscore prefixes — module privacy is enforced by export, not naming.

## Design tokens

- OKLCH palette defined in `src/app/globals.css`:
  - `--primary` terracotta `oklch(0.67 0.17 45)` — CTAs, active states.
  - `--secondary` cobalt `oklch(0.62 0.14 235)` — links, focus rings.
  - `--accent` amber `oklch(0.78 0.12 75)` — highlights, badges.
  - `--surface`, `--muted`, `--ink`, `--ink-subtle`, `--border`, `--destructive`.
- Typography: Geist Sans (body/UI), Geist Mono (code), Fraunces (display — headings, hero numerals). Loaded via `next/font/google` in `app/layout.tsx`.
- Motion: `framer-motion`, 150-250ms default, 350ms for page transitions. Respect `prefers-reduced-motion`.
- Radii: `rounded-lg` (0.75rem default), `rounded-xl` (1.25rem), `rounded-2xl` (1.75rem) for cards.
- Icons: Lucide only; sizes 16/20/24/32; stroke 1.5 default.

## Hard constraints

- Never put feature components in `components/ui/` — that folder is shadcn primitives only.
- Never touch Yjs state outside `lib/yjs/` and `features/*/hooks/*` — components should never call `doc.transact(...)` directly. Mutations go through `lib/yjs/mutations.ts` (`addItem`, `removeItem`, `reorderItems`, `setDayNotes`, `updateItemNotes`, `clearDayContent`, `setPlanMeta`, `toggleLike`, `setRating`, `clearRating`, `postComment`, `editComment`, `deleteComment`); reads go through the observer hooks in `lib/yjs/hooks.ts` (`useYAllItems`, `useYAllDayNotes`, `useYPlanMeta`, `useYAllLikes`, `useYAllRatings`, `useYComments`, `useRemoteAwareness`).
- Y.Doc roots: items, day_notes, plan_meta, likes, ratings, comments. Hotels, destinations, and the `plan_days` lifecycle stay REST-driven. Don't add another root without an ADR — see ADR 2026-05-06 (revised).
- Awareness state (`{user, editing: {kind, id} | null}`) is ephemeral — published via `provider.awareness.setLocalState…` from `AwarenessPublisher` (user identity) and `useEditingReporter` (focus/blur on the four free-text surfaces: day notes, item notes, chat composer, per-item comment composer). `EditingPresence` filters remote awareness by `(kind, id)` and renders avatar pills next to the matching label. Never persist awareness; it's not part of the Y.Doc. Hover or idle viewing does NOT publish presence — see ADR 2026-05-06 for the design rationale.
- Don't reach for `lib/api/social.ts` for likes/ratings/comments — those REST endpoints exist only as the materializer's reconciliation target. Frontend reads/writes go through Yjs.
- Never persist raw query responses that contain an access token.
- Never use the Next.js `pages/` router.
- The Y.Doc + `IndexeddbPersistence` are tied to `planId`; the Hocuspocus provider is tied to the auth token. Losing the token (e.g. Supabase can't refresh while offline) must NOT tear down the doc — see `lib/yjs/provider.ts` (`createPlanDoc` / `createPlanProvider`) and `lib/yjs/hooks.ts:useYDoc`.
- Always `await localLoaded` (from `createPlanDoc`) before constructing a `HocuspocusProvider` on the same doc. Without the gate, the sync handshake races IndexedDB hydration and offline edits get dropped.
- On logout call `destroyAllPlanPersistence()` from `lib/offline/cleanup.ts` (already wired in `LogoutButton`); on a 403/404 from `/internal/collab/authorize` call `destroyPlanPersistence(planId)` so stale offline edits don't outlive plan access.
- Disable server-only actions (rename trip, delete plan, refresh cross-city transport) when `useOnlineStatus().online === false`. Surface live sync state via `<ConnectionStatusBadge provider={…} />` in `PlanHeader`; mount `useConnectionToasts()` once near the plan workspace root to fire debounced online↔offline toasts (5 s flap window).
