# Frontend — Conventions & Architecture

## Directory structure

```
src/
├── app/                          Next.js App Router pages
│   ├── (auth)/                   Route group — login, register (shared layout, no URL segment)
│   ├── auth/callback/route.ts    OAuth code-exchange handler (not a page)
│   ├── plans/[id]/               Itinerary editor
│   ├── plans/new/                Plan creation
│   └── settings/preferences/    User preferences
├── components/ui/                Shadcn/UI primitives only — never put feature code here
├── features/                     Feature-scoped components and hooks
│   ├── auth/components/          LoginForm, RegisterForm, LogoutButton
│   ├── plans/components/         All itinerary UI components
│   ├── plans/hooks/              All itinerary data-fetching hooks
│   └── settings/components/     PreferencesForm
└── lib/
    ├── api/                      All FastAPI calls (client.ts + domain files + index.ts barrel)
    ├── supabase/                 client.ts (browser) + server.ts (SSR/server components)
    └── utils.ts                  cn(), isAbortError()
```

## Auth pattern

- `lib/supabase/client.ts` — browser Supabase client (`createBrowserClient`)
- `lib/supabase/server.ts` — server Supabase client (`createServerClient` with cookie adapter); used in server components and route handlers
- `middleware.ts` — validates the session on every request; redirects unauthenticated users to `/login`; must be at `src/middleware.ts` — Next.js will not detect it anywhere else
- `app/auth/callback/route.ts` — receives the `?code=` param from Supabase OAuth redirect and calls `exchangeCodeForSession(code)` to set the session cookie; must live at `/auth/callback` to match the redirect URL configured in Supabase
- `app/(auth)/` — parentheses make this a route group: `/login` and `/register` share a layout without the segment appearing in the URL

## Conventions

- Import order: `"use client"` directive → React → Next.js → third-party → `@/components/ui/` → `@/lib/` → `@/features/`; blank line between each group
- All imports use absolute `@/` paths — never relative `./Sibling` or `../hooks/Hook`
- App Router only — no `pages/` directory
- Server components by default; add `"use client"` only when the component needs event handlers, hooks, or browser APIs
- Supabase is queried in server components via `@/lib/supabase/server` — never query Supabase directly from client components
- All FastAPI calls go through `@/lib/api/` (barrel re-exported from `index.ts`)
- Always use Shadcn/UI components — check `components/ui/` before installing a new package
- Tailwind for all styling — no CSS modules or styled-components
- Component filenames must be PascalCase (`ItemSearch.tsx`, `CreatePlanForm.tsx`) — never kebab-case
- One component per file — never define more than one exported component in a file
- Feature-specific code lives in `features/<feature>/components/` and `features/<feature>/hooks/`
- Complex data-fetching logic (refs, effects, abort controllers) must be extracted to a hook in the same feature's `hooks/` folder
- Build query strings with `URLSearchParams` — never manual string interpolation
- Custom hooks must never expose raw React state setters (`setX`) — encapsulate mutations behind named action functions (`handleNameChange`, `handleSelect`)
- Hook interfaces: options type named `Use{HookName}Options`; return type named `Use{HookName}Return` (exported; always annotate the function return type explicitly)
- Abort error guard: use `isAbortError(error)` from `@/lib/utils` — never inline `(e as Error).name !== "AbortError"`
- Display-layer label maps (e.g., `FIELD_LABELS`) must be module-level named constants with a comment marking them as intentionally configurable
- `PlanItem.ai_data` is typed as `EnrichedItem | CrossCityMarker | null` — access fields directly; `CrossCityMarker` is written exclusively by `useCrossCityTransport`

## Features

| Feature | Page | Client component | Hook |
|---|---|---|---|
| Plan creation | `app/plans/new/page.tsx` | `features/plans/components/CreatePlanForm.tsx` | — |
| Itinerary planner | `app/plans/[id]/page.tsx` | `features/plans/components/ItineraryPlanner.tsx` | `hooks/usePlanItinerary.ts` |
| Item search + enrichment | — | `features/plans/components/ItemSearch.tsx` | `hooks/useItemEnrichment.ts` |
| AI suggestions strip | — | `features/plans/components/SuggestionsStrip.tsx` | `hooks/useAiSuggestions.ts` |
| Same-day transport | — | `features/plans/components/InlineTransportBar.tsx` | `hooks/useDayTransport.ts` |
| Cross-city transport | — | `features/plans/components/CrossCityTransportPanel.tsx` | `hooks/useCrossCityTransport.ts` |
| User preferences | `app/settings/preferences/page.tsx` | `features/settings/components/PreferencesForm.tsx` | — |
| Auth | `app/(auth)/login/`, `app/(auth)/register/` | `features/auth/components/` | — |
