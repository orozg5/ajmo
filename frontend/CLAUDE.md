# Frontend — Conventions & Features

## Frontend conventions

- Import order within every file: `"use client"` directive → React → Next.js → third-party libraries → `@/components/ui/` (Shadcn) → `@/lib/` → `@/features/`; blank line between each group
- Always use Shadcn/UI components: never use raw HTML for UI — always install and use the Shadcn component
- Tailwind for all styling, no CSS modules or styled-components
- App Router only — no pages/ directory
- Server components by default; use "use client" only when necessary (event handlers, hooks, Yjs)
- Supabase is queried directly via @supabase/ssr in Server Components and route handlers
- All calls to the FastAPI backend go through /frontend/src/lib/api/ (barrel re-exported via index.ts)
- Server components use fetch() directly, client components use TanStack Query
- Component files must use PascalCase (e.g., `ItemSearch.tsx`, `CreatePlanForm.tsx`) — never kebab-case
- Feature-specific components and hooks live in `frontend/src/features/<feature>/components/` and `frontend/src/features/<feature>/hooks/`; one component per file — never define more than one component in a file
- Truly shared, feature-agnostic UI goes in `frontend/src/components/` (currently only `ui/` for Shadcn primitives)
- Complex data-fetching logic (refs, effects, handlers) in client components must be extracted to a `hooks/` directory within the same feature folder
- Use `URLSearchParams` for building query strings in api.ts, never manual string interpolation
- Display-layer label maps (e.g., FIELD_LABELS) must be module-level named constants with a comment marking them as intentionally configurable
- All imports must use absolute `@/` paths — never relative imports like `./Sibling` or `../hooks/Hook`
- Custom hooks must never expose raw React state setters (`setX`) — encapsulate state mutations behind named action functions (e.g. `handleNameChange`, `handleFieldChange`, `handleActiveIndexChange`)
- Hook options interface: named `Use{HookName}Options` (e.g. `UseAiSuggestionsOptions`, `UseItemEnrichmentOptions`) — never `Props` (that's a component convention)
- Hook return interface: exported and named `Use{HookName}Return` (e.g. `UseItemEnrichmentReturn`, `UsePlanItineraryReturn`) — always annotate the function return type explicitly
- Abort error guard: use `isAbortError(error)` from `@/lib/utils` — never inline `(e as Error).name !== "AbortError"`
- `PlanItem.ai_data` is typed as `EnrichedItem | CrossCityMarker | null` — access fields directly, never cast to `Record<string, unknown>`; `CrossCityMarker` (from `@/lib/api/ai.ts`) is the only non-enriched shape allowed and is written exclusively by `useCrossCityTransport` to mark a covered inter-city transition

## Current working features

- /plans/new — plan creation form
  - Server component: /frontend/src/app/plans/new/page.tsx
  - Client form: /frontend/src/features/plans/components/CreatePlanForm.tsx
    - Shadcn Form + zod + react-hook-form
    - After date fields: Destinations section — inline add form (country input, city input, day checkboxes based on date range), list of added destinations with remove buttons; at least one destination required before submit
    - Submit flow: createPlan() → POST each destination via createDestination() → redirect to /plans/[id]
  - owner_id is a temporary form field (hardcoded dev UUID); replaced by auth.uid() when auth lands

- /plans/[id] — day-by-day itinerary planner
  - Server component: /frontend/src/app/plans/[id]/page.tsx
  - Fetches plan, days, and destinations in parallel: `Promise.all([getPlan(), initializeDays(), getDestinations(planId)])`; passes all three to ItineraryPlanner
  - Client component: /frontend/src/features/plans/components/ItineraryPlanner.tsx — owns day tabs (Shadcn Tabs), Add day button, wires all mutations; accepts `destinations` prop and filters to `dayDestinations` per DayView
  - State managed by /frontend/src/features/plans/hooks/usePlanItinerary.ts — local days state updated optimistically via TanStack Query mutations; addItem uses mutateAsync and returns Promise<PlanItem> so DayView can surface save errors
  - Day view: /frontend/src/features/plans/components/DayView.tsx — renders one destination block per day-destination; each block has a destination header (City, Country) + ItemSearch + items filtered by `item.destination_id === dest.id`; fallback block at top for legacy items without destination_id; cancel remounts ItemSearch via key counter to clear input/result
  - Item card: /frontend/src/features/plans/components/ItemCard.tsx — collapsible (chevron toggle); collapsed shows title + type badge + location/time; expanded shows AI fields + editable notes textarea (saves on blur via PATCH)

- ItemSearch — AI enrichment UI with autocomplete dropdown, scoped to a plan's destination
  - Client component: /frontend/src/features/plans/components/ItemSearch.tsx
  - Accepts only `destination: string` for enrichment scope; `destination_id` is captured by DayView via the `makeHandleEnrich(dest.id)` closure — ItemSearch does not need a `destinationId` prop
  - Shadcn Tabs for item type (Attraction / Restaurant / Hotel / Transport / Activity); switching tabs resets all state
  - Data-fetching logic (abort controllers, debounce, effects) extracted to /frontend/src/features/plans/hooks/useItemEnrichment.ts
  - Two independent AbortControllers: autocompleteAbortRef (autocomplete) and enrichAbortRef (enrichment) — never cancel each other
  - Two refs for select flow: justSelectedRef (skips autocomplete re-query after setName) and skipDebounceRef (fires enrichment at 0ms delay)
  - Autocomplete effect: fires immediately on name change (no debounce) → GET /places/autocomplete → sets suggestions + showDropdown
  - Enrichment effect: deps = [name, itemType, destination, showDropdown] — returns early if showDropdown is true; skipDebounceRef bypasses 700ms on select
  - Click-outside: mousedown listener on document, guarded by containerRef (kept in component — DOM concern)
  - Keyboard nav on Input: ArrowDown/Up calls handleActiveIndexChange with functional updater, Enter selects, Escape closes dropdown
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
  - Each card shows emoji (by type), name, one_line description, price_hint, destination_city (badge/subtitle); clicking card shows day selector to pick which day to add it to
  - Skeleton loading: 4 placeholder cards while fetching

- Transport suggestions — same-day and cross-city transport UI wired into the itinerary planner
  - `DayTransportContext` interface (exported from DayView.tsx): `{ suggestions: Map<string, TransportSuggestion>, isFetching: boolean, addingKeys: Set<string>, onAddTransportOption(suggestion, optionIndex, extra?), transportPositions?: Map<string, string> }` — passed from ItineraryPlanner into each DayView
  - InlineTransportBar: /frontend/src/features/plans/components/InlineTransportBar.tsx
    - Rendered between consecutive non-transport items within a destination section in DayView
    - Props: `suggestion?: TransportSuggestion`, `isFetching: boolean`, `isAdding: boolean`, `onAdd(optionIndex: number) => void`
    - Shows transport options as buttons; skeleton while fetching; hidden when no suggestion for the pair
  - CrossCityTransportPanel: /frontend/src/features/plans/components/CrossCityTransportPanel.tsx
    - Modal/panel listing all cross-city transition suggestions; opened from a button in ItineraryPlanner
    - Shows source → destination city pairs with Add buttons per transport option
  - useDayTransport: /frontend/src/features/plans/hooks/useDayTransport.ts
    - Options: `UseDayTransportOptions { planId }`; Return: `UseDayTransportReturn`
    - Manages per-day state in a Map keyed by dayId; tracks dismissed pairs (Set) and in-session transport positions (Map<transportId, sourceItemId>) for optimistic re-ordering
    - `fetchForDay(dayId)` — POST /ai/transport-suggestions/day; per-day AbortControllers prevent cross-day cancellation
    - `addOption(suggestion, optionIndex, dayId, onAddItem, extra?)` — calls onAddItem then updates transportPositions for immediate re-ordering
  - useCrossCityTransport: /frontend/src/features/plans/hooks/useCrossCityTransport.ts
    - Options: `UseCrossCityTransportOptions { planId }`; Return: `UseCrossCityTransportReturn`
    - `fetchSuggestions()` — POST /ai/transport-suggestions/cross-city; single AbortController
    - `openPanel()` / `closePanel()` — controls panel visibility; `hasFetched` tracks first-load state
    - `addOption(suggestion, optionIndex, dayId, onAddItem, extra?)` — stores `CrossCityMarker` in ai_data and removes suggestion from panel immediately

- /frontend/src/lib/api/ — central API layer for all FastAPI calls, split by domain
  - `client.ts` — `apiFetch<T>()` wrapper: returns `undefined as T` for 204, throws on non-ok with detail message
  - `plans.ts` — Plan, CreatePlanPayload, PlanItem, PlanDay, AddItemPayload, DestinationResponse; plan CRUD + itinerary functions (initializeDays, getDays, addDay, removeDay, addItem, removeItem, updateItemNotes) + destination functions (createDestination, getDestinations)
  - `ai.ts` — EnrichedItem, CrossCityMarker, PlaceSuggestion, AiSuggestion (includes `destination_city: string`), AiSuggestionsResult, TransportOption, TransportSuggestion, TransportSuggestionsResult; enrichItem, enrichBatch, autocompletePlaces, getSuggestions, getNextSuggestion, getDayTransportSuggestions, getCrossCityTransportSuggestions
  - `users.ts` — UserPreferences; getPreferences, upsertPreferences
  - `index.ts` — barrel re-export; all imports from `@/lib/api` continue to work unchanged
  - Query strings built with URLSearchParams; AbortSignal passed where relevant
