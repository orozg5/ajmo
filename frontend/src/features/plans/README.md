# features/plans

Everything related to plans lives here: the dashboard card views, the itinerary editor, the search UI, transport suggestions, hotel booking, and the create-plan wizard.

## Components — by concern

Components under `plans/components/` are grouped by what they *do*, not by their shape.

| Folder | What lives here |
| --- | --- |
| `dashboard/` | Plan list entry views — `PlanCard`, `DashboardSections`, `EmptyPlansState`, `SkeletonCard`. |
| `itinerary/` | The plan page itself — `PlanHeader` (page chrome), `ItineraryPlanner` (DnD + panel coordinator), `DayView`, `DaySidebar`, `DayNotesEditor`, `AddNoteInline`, `ItemCard`. |
| `search/` | Adding items — `ItemSearch` (autocomplete), `SuggestionsStrip` + `SuggestionCard` (AI picks). |
| `transport/` | Transport UI — `TransportCard`, `CrossCityTransportPanel`, `CrossCityTransitBand`, `InlineTransportBar`. |
| `hotels/` | Stays — `BookStayDialog` + `HotelNameAutocomplete` + `HotelPreviewCard` (split for clarity), `HotelBand`, `StaysStrip`. |
| `wizard/` | Create-plan flow — `CreatePlanWizard`, `schema.ts`, and one file per step. |

## Hooks — `plans/hooks/`

Each hook owns one slice of server state + its optimistic updates. Components never hold server state directly — they call hooks.

| File | Owns |
| --- | --- |
| `usePlanItinerary.ts` | Days + items for an open plan. Mutations: add/remove/reorder items, update notes, add/remove day. |
| `useDayTransport.ts` | Same-day transport suggestions and the "pending pairs" detection. |
| `useCrossCityTransport.ts` | Cross-city transport suggestions + panel state. |
| `useHotels.ts` | Hotel items attached to a plan. |
| `useAiSuggestions.ts` | AI suggestion strip — fetch, refresh, add. |
| `useItemEnrichment.ts` | Autocomplete + `/ai/enrich` flow. Wrapped by `ItemSearch` and `HotelNameAutocomplete`. |
| `useDayNotes.ts` | Per-day freeform notes. |
| `useDestinations.ts` | Plan destinations CRUD. |
| `useDashboardPlans.ts` | Dashboard list queries (owner / member / public). |
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
| `transportPairs.ts` | `hasPendingWithinDayPairs` — drives the "fetch transport" CTA. |

## Where to add a new piece of UI

1. **Is it a new plans-feature concern?** Pick (or create) a folder under `components/` by what it *does* — don't sort by prop shape.
2. **Does it talk to the backend?** The network call belongs in a hook in `hooks/`. Components stay dumb and accept props.
3. **Is there pure logic that isn't React?** Extract to `utils/` and import from the component. Keep the `utils/` file small and testable.
4. **Does it need a constant/label used elsewhere?** Put it in `utils/` with the other display-layer maps — don't duplicate.
5. **Is it a Shadcn primitive?** Check `frontend/src/components/ui/` first — don't reimplement.
