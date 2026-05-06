# features/plans

Everything related to plans lives here: the dashboard card views, the itinerary editor, the search UI, transport suggestions, hotel booking, and the create-plan wizard.

## Components — by concern

Components under `plans/components/` are grouped by what they *do*, not by their shape.

| Folder | What lives here |
| --- | --- |
| `dashboard/` | Plan list entry views — `DashboardSections` (top-level composer), `HomeHero` (greeting + trip-stat banner driven by `tripStatus`), `TripsExplorer` (tabs over scopes, filter bar, paginated card grid), `TripFilterBar` (search + sort + period filters), `TripStatusPill`, `PlanCard`, `EmptyPlansState`, `SkeletonCard`. |
| `itinerary/` | The plan page itself — `PlanWorkspace` (role-aware shell that initializes the Yjs doc and threads `role` + `doc` + `liveMeta` into the children), `PlanHeader` (page chrome + edit/delete/share entry points; mirrors plan-meta over the Y.Doc), `ItineraryPlanner` (DnD + panel coordinator + `DragOverlayCard`; drag-activation distance is infinity for viewers), `DayView`, `DayTabs` (DnD-droppable day chips, replaces the legacy `DaySidebar`), `DayNotesEditor`, `AddNoteInline`, `ItemCard`, `EditPlanDialog` (split into `EditPlanGeneralTab`, `EditPlanDestinationsTab`, `EditPlanDangerTab`; broadcasts edits to peers via `setPlanMeta()` after REST save), `DeletePlanDialog`. |
| `destinations/` | `DestinationsEditor` — destinations list (country, city, day-number selection) shared between the wizard and the EditPlanDestinationsTab. |
| `search/` | Adding items — `ItemSearch` (autocomplete), `SuggestionsStrip` + `SuggestionCard` (AI picks). |
| `transport/` | Transport UI — `TransportCard`, `CrossCityTransportPanel`, `InlineTransportBar`. |
| `hotels/` | Stays — `BookStayDialog` + `HotelNameAutocomplete` + `HotelPreviewCard` (split for clarity), `HotelBand`, `StaysStrip`. |
| `wizard/` | Create-plan flow — `CreatePlanWizard`, `schema.ts`, and one file per step (uses `destinations/DestinationsEditor`). |

## Hooks — `plans/hooks/`

Each hook owns one slice of server state + its optimistic updates. Components never hold server state directly — they call hooks.

| File | Owns |
| --- | --- |
| `usePlanItinerary.ts` | Days + items for an open plan. Initializes the Yjs Hocuspocus provider via `useYDoc(planId)`, observes `useYAllItems` + `useYAllDayNotes`, and routes mutations (add/remove/reorder items, update day notes, add/remove day) through `lib/yjs/mutations.ts`. Viewer mode short-circuits all writes. |
| `useSameDayTransportOptions.ts` | Per-pair fan-out for the inline transport bar — fires `POST /transit/osrm-route` for `foot`/`bike`/`driving` and `POST /transit/directions` (Transitous) for transit. Buttons hide on 204. |
| `useSameDayTransportInsert.ts` | State + insertion logic for adding a same-day transport plan item from a chosen mode option (writes `ai_data.same_day_pair`). |
| `useCrossCityTransport.ts` | Cross-city transport suggestions (SSE-streamed; backend orchestrates OSRM + Transitous + flight estimator — no LLM, ADR 2026-05-06) + panel state. |
| `useHotels.ts` | Hotel items attached to a plan (REST-driven; not in the Y.Doc per ADR 2026-05-06). |
| `useAiSuggestions.ts` | AI suggestion strip — fetch, refresh, add. |
| `useItemEnrichment.ts` | Autocomplete + `/ai/enrich` flow. Wrapped by `ItemSearch` and `HotelNameAutocomplete`. |
| `useDayNotes.ts` | Per-day freeform notes; writes through `lib/yjs/mutations.ts:setDayNotes` and observes echoes via the Y.Doc. |
| `useItemNotes.ts` | Per-item freeform notes; writes through `lib/yjs/mutations.ts:updateItemNotes` and observes echoes via the Y.Doc (mirrors the `useDayNotes` shape). |
| `useDestinations.ts` | Plan destinations CRUD (uses `PATCH /plans/{id}/destinations/{destination_id}` for inline edits). |
| `useDashboardPlans.ts` | Dashboard list queries (owner / member / public). |
| `usePlanFilters.ts` | Dashboard filter/sort/search/pagination state machine consumed by `TripsExplorer` + `TripFilterBar`. |
| `useCoverUpload.ts` | Cover image upload to Supabase Storage. |

## Utils — `plans/utils/`

Pure helpers. No React, no network.

| File | Purpose |
| --- | --- |
| `sortKeys.ts` | Fractional sort-key math (`sortItems`, `appendSortKey`, `computeSortKeyBetween`). |
| `visibility.ts` | `VISIBILITY_ICON`, `VISIBILITY_LABEL` maps (+ `PlanVisibility` type). |
| `itemType.ts` | `ITEM_TYPE_STYLE`, `ITEM_TYPE_EMOJI`, `ItemType` union. |
| `fieldLabels.ts` | Display labels for enrichment fields. |
| `crossCityPayload.ts` | `computeCrossCityExtraPayload` — decides which day/destination a cross-city transport item attaches to. |
| `dragEndToReorderEntry.ts` | Converts a `DragEndEvent` into a `ReorderEntry` for the backend (pure). |
| `tripStatus.ts` | `getTripStatus(plan, today)` — derives `upcoming`/`ongoing`/`past`/`undated` from a plan's date range; powers `TripStatusPill` + `HomeHero` stats. |
| `formatDateRange.ts` | Display formatter for `date_from` / `date_to` (handles open-ended and same-day ranges). |
| `transportFormat.ts` | Formatters for distance (m/km) and duration (s → "1h 23m") shared across `InlineTransportBar`, `TransportCard`, and the cross-city panel. |

## Where to add a new piece of UI

1. **Is it a new plans-feature concern?** Pick (or create) a folder under `components/` by what it *does* — don't sort by prop shape.
2. **Does it talk to the backend?** The network call belongs in a hook in `hooks/`. Components stay dumb and accept props.
3. **Is there pure logic that isn't React?** Extract to `utils/` and import from the component. Keep the `utils/` file small and testable.
4. **Does it need a constant/label used elsewhere?** Put it in `utils/` with the other display-layer maps — don't duplicate.
5. **Is it a Shadcn primitive?** Check `frontend/src/components/ui/` first — don't reimplement.
