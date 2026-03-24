# Frontend — Conventions & Features

## Frontend conventions

- Always use Shadcn/UI components: never use raw HTML for UI — always install and use the Shadcn component
- Tailwind for all styling, no CSS modules or styled-components
- App Router only — no pages/ directory
- Server components by default; use "use client" only when necessary (event handlers, hooks, Yjs)
- Supabase is queried directly via @supabase/ssr in Server Components and route handlers
- All calls to the FastAPI backend go through /frontend/src/lib/api.ts
- Server components use fetch() directly, client components use TanStack Query
- Component files must use PascalCase (e.g., `ItemSearch.tsx`, `CreatePlanForm.tsx`) — never kebab-case
- Complex data-fetching logic (refs, effects, handlers) in client components must be extracted to `frontend/src/hooks/` (e.g., `useItemEnrichment.ts`)
- Use `URLSearchParams` for building query strings in api.ts, never manual string interpolation
- Display-layer label maps (e.g., FIELD_LABELS) must be module-level named constants with a comment marking them as intentionally configurable

## Current working features

- /plans/new — plan creation form
  - Server component: /frontend/src/app/plans/new/page.tsx
  - Client form: /frontend/src/components/CreatePlanForm.tsx
    - Shadcn Form + zod + react-hook-form + useMutation(createPlan) → redirect to /plans/[id] on success
  - owner_id is a temporary form field (hardcoded dev UUID); replaced by auth.uid() when auth lands

- /plans/[id] — plan detail page
  - Server component: /frontend/src/app/plans/[id]/page.tsx
  - Fetches plan via getPlan() server-side; passes destination as prop — never re-fetched client-side
  - Renders <ItemSearch destination={destination} /> when destination is set

- ItemSearch — AI enrichment UI with autocomplete dropdown, scoped to a plan's destination
  - Client component: /frontend/src/components/ItemSearch.tsx
  - Shadcn Tabs for item type (Attraction / Restaurant / Hotel / Transport / Activity); switching tabs resets all state
  - Data-fetching logic (abort controllers, debounce, effects) extracted to /frontend/src/hooks/useItemEnrichment.ts
  - Two independent AbortControllers: autocompleteAbortRef (autocomplete) and enrichAbortRef (enrichment) — never cancel each other
  - Two refs for select flow: justSelectedRef (skips autocomplete re-query after setName) and skipDebounce (fires enrichment at 0ms delay)
  - Autocomplete effect: fires immediately on name change (no debounce) → GET /places/autocomplete → sets suggestions + showDropdown
  - Enrichment effect: deps = [name, itemType, destination, showDropdown] — returns early if showDropdown is true; skipDebounce bypasses 700ms on select
  - Click-outside: mousedown listener on document, guarded by containerRef (kept in component — DOM concern)
  - Keyboard nav on Input: ArrowDown/Up moves activeIndex, Enter selects, Escape closes dropdown
  - Dropdown: role="listbox" with role="option" items; onMouseDown + e.preventDefault() keeps input focused during click — do NOT use onClick here
  - ARIA: Input has role="combobox", aria-expanded, aria-haspopup, aria-autocomplete, aria-activedescendant
  - Loader2 spinner inside input right side while enrichment is in flight
  - Result card renders all non-null fields for the selected type

- /frontend/src/lib/api.ts — central API helper for all FastAPI calls
  - apiFetch<T>() wrapper, Plan interface, CreatePlanPayload, EnrichedItem interface, PlaceSuggestion interface
  - Exports: createPlan, getPlan, enrichItem(name, destination, item_type, signal?), autocompletePlaces(q, destination, item_type, signal?) — both accept AbortSignal
  - Query strings built with URLSearchParams
