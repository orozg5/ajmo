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
- Feature-specific components and hooks live in `frontend/src/features/<feature>/components/` and `frontend/src/features/<feature>/hooks/`; one component per file — never define more than one component in a file
- Truly shared, feature-agnostic UI goes in `frontend/src/components/` (currently only `ui/` for Shadcn primitives)
- Complex data-fetching logic (refs, effects, handlers) in client components must be extracted to a `hooks/` directory within the same feature folder
- Use `URLSearchParams` for building query strings in api.ts, never manual string interpolation
- Display-layer label maps (e.g., FIELD_LABELS) must be module-level named constants with a comment marking them as intentionally configurable

## Current working features

- /plans/new — plan creation form
  - Server component: /frontend/src/app/plans/new/page.tsx
  - Client form: /frontend/src/features/plans/components/CreatePlanForm.tsx
    - Shadcn Form + zod + react-hook-form + useMutation(createPlan) → redirect to /plans/[id] on success
  - owner_id is a temporary form field (hardcoded dev UUID); replaced by auth.uid() when auth lands

- /plans/[id] — day-by-day itinerary planner
  - Server component: /frontend/src/app/plans/[id]/page.tsx
  - Calls getPlan() + initializeDays() in parallel server-side; days are auto-created from plan's date_from/date_to on first load (idempotent)
  - Client component: /frontend/src/features/plans/components/ItineraryPlanner.tsx — owns day tabs (Shadcn Tabs), Add day button, wires all mutations
  - State managed by /frontend/src/features/plans/hooks/usePlanItinerary.ts — local days state updated optimistically via TanStack Query mutations; addItem uses mutateAsync and returns Promise<PlanItem> so DayView can surface save errors
  - Day view: /frontend/src/features/plans/components/DayView.tsx — item list + ItemSearch add-item section; cancel remounts ItemSearch via key counter to clear input/result
  - Item card: /frontend/src/features/plans/components/ItemCard.tsx — collapsible (chevron toggle); collapsed shows title + type badge + location/time; expanded shows AI fields + editable notes textarea (saves on blur via PATCH)

- ItemSearch — AI enrichment UI with autocomplete dropdown, scoped to a plan's destination
  - Client component: /frontend/src/features/plans/components/ItemSearch.tsx
  - Shadcn Tabs for item type (Attraction / Restaurant / Hotel / Transport / Activity); switching tabs resets all state
  - Data-fetching logic (abort controllers, debounce, effects) extracted to /frontend/src/features/plans/hooks/useItemEnrichment.ts
  - Two independent AbortControllers: autocompleteAbortRef (autocomplete) and enrichAbortRef (enrichment) — never cancel each other
  - Two refs for select flow: justSelectedRef (skips autocomplete re-query after setName) and skipDebounceRef (fires enrichment at 0ms delay)
  - Autocomplete effect: fires immediately on name change (no debounce) → GET /places/autocomplete → sets suggestions + showDropdown
  - Enrichment effect: deps = [name, itemType, destination, showDropdown] — returns early if showDropdown is true; skipDebounceRef bypasses 700ms on select
  - Click-outside: mousedown listener on document, guarded by containerRef (kept in component — DOM concern)
  - Keyboard nav on Input: ArrowDown/Up moves activeIndex, Enter selects, Escape closes dropdown
  - Dropdown: role="listbox" with role="option" items; onMouseDown + e.preventDefault() keeps input focused during click — do NOT use onClick here
  - ARIA: Input has role="combobox", aria-expanded, aria-haspopup, aria-autocomplete, aria-activedescendant
  - Loader2 spinner inside input right side while enrichment is in flight
  - Result card renders all non-null fields for the selected type

- /app/settings/preferences/ — user travel preferences
  - Server component: /frontend/src/app/settings/preferences/page.tsx — reads user_id from URL search params (dev placeholder; replaced by auth.uid() when auth lands)
  - Client form: /frontend/src/features/settings/components/PreferencesForm.tsx
    - Interest tags (add via Enter key or button, remove via X), dietary toggle buttons, budget toggle group, custom notes textarea
    - Loads existing preferences on mount via GET /users/me/preferences; 404 = no prefs yet, start with empty form; other errors shown inline
    - Saves via PUT /users/me/preferences; displays "Saved!" confirmation for 3s or inline error on failure

- SuggestionsStrip — horizontal AI suggestion cards shown above the itinerary when destination is set
  - Client component: /frontend/src/features/plans/components/SuggestionsStrip.tsx
  - Sub-components (one per file): SuggestionCard.tsx (card with day picker), SkeletonCard.tsx (loading placeholder)
  - Rendered by ItineraryPlanner.tsx when plan.destination is set
  - Data-fetching logic in /frontend/src/features/plans/hooks/useAiSuggestions.ts
    - Fetches from POST /ai/suggestions on mount; auto-retries once with force_refresh=true if result is empty
    - addSuggestion(): enriches a suggestion via POST /ai/enrich, then calls onAddItem() (fire-and-forget); tracks addingNames Set for optimistic UI
    - refresh(): clears current suggestions and force-fetches fresh ones
  - Each card shows emoji (by type), name, one_line description, price_hint; clicking card shows day selector to pick which day to add it to
  - Skeleton loading: 4 placeholder cards while fetching

- /frontend/src/lib/api/ — central API layer for all FastAPI calls, split by domain
  - `client.ts` — `apiFetch<T>()` wrapper: returns `undefined as T` for 204, throws on non-ok with detail message
  - `plans.ts` — Plan, CreatePlanPayload, PlanItem, PlanDay, AddItemPayload; plan CRUD + itinerary functions (initializeDays, getDays, addDay, removeDay, addItem, removeItem, updateItemNotes)
  - `ai.ts` — EnrichedItem, PlaceSuggestion, AiSuggestion, AiSuggestionsResult; enrichItem, enrichBatch, autocompletePlaces, getSuggestions, getNextSuggestion
  - `users.ts` — UserPreferences; getPreferences, upsertPreferences
  - `index.ts` — barrel re-export; all imports from `@/lib/api` continue to work unchanged
  - Query strings built with URLSearchParams; AbortSignal passed where relevant
