# Phase 3 — Rich itinerary editing (DnD, hotels, day notes)

**Exit bar**: single user can build a complex itinerary with drag-and-drop, hotels spanning days, and day notes. Schema v2 live. `sort_key` is authoritative ordering. `usePlanItinerary` migrated off raw `useState` to React Query cache.

## In scope

### Schema cutover

- [x] `plan_items.sort_key text` live (applied in Phase 0 schema).
- [x] Backfill script: `backend/scripts/backfill_sort_keys.py` walks per-day items in current `sort_order` and assigns `sort_key` via `generate_key_between`; idempotent re-runs.
- [x] `plan_items.sort_order int` retained one release for safety; sorting still falls back when `sort_key` missing.

### dnd-kit integration

- [x] `ItineraryPlanner` wraps the whole planner in a single `<DndContext>`; `DayView` uses `<SortableContext>` + `verticalListSortingStrategy`.
- [x] Drag scopes covered: within-day reorder (drop on another item), across-day drop (drop on `DaySidebar` chip via `useDroppable`).
- [x] Sort-key generation: `computeSortKeyBetween` wraps `generateKeyBetween` from `fractional-indexing-jittered` in `features/plans/utils/sortKeys.ts`.
- [x] Keyboard DnD enabled via `KeyboardSensor` with `sortableKeyboardCoordinates`.

### Hotels

- [x] Sidebar affordance: `HotelsSidebarSection` with **Book a stay** button; `BookStayDialog` (RHF + Zod) picks destination, check-in/out day, check-in/out time, notes.
- [x] `HotelBand` renders on every day in `check_in_day_number..check_out_day_number` range with check-in/out chips on the end days.
- [x] Edit + delete flow via hotel row click in sidebar and inline band icons.

### Day notes

- [x] `DayNotesEditor` — autosize textarea, `useDayNotes` hook debounces 800ms and PATCHes `/plans/{plan_id}/days/{day_id}` with `{notes}`. Saving pill visible while in-flight.

### Item card v2

- [x] 72×72 thumbnail (from `ai_data.image_url`), drag handle (GripVertical), key-facts badges (start time, duration, price), expandable description + notes, reaction strip placeholder with Phase 5 tooltip.

### Backend

- [x] `PATCH /plans/{plan_id}/reorder` accepts `[{id, sort_key, day_id, destination_id}]` — batch per-row apply.
- [x] `PATCH /plans/{plan_id}/days/{day_id}` writes `notes` and `title`.
- [x] `plan_hotels` CRUD: `GET`, `POST`, `PATCH`, `DELETE /plans/{plan_id}/hotels[/{hotel_id}]`; list enriches with `place_name` + `place_image_url`.

### Frontend data layer

- [x] `usePlanItinerary` migrated to React Query: `useQuery` as source of truth, mutations use `onMutate` optimistic patches + `onError` rollback + `onSettled` invalidate for reorder. No raw `useState`.

## Out of scope

- Maps (Phase 4).
- Comments / reactions / ratings wiring (Phase 5 — reaction strip is placeholder only here).
- Realtime (Phase 6).

## Verification

- Drag an item from Day 1 Rome → Day 3 Naples — reorder sticks on refresh.
- Create a hotel spanning days 2-4 — band visible across Day 2, 3, 4 tabs.
- Day notes autosave — reload within 2s, notes persist.
- Backend `/reorder` batch: 50 items in one call succeeds under 200ms.
- Concurrent reorders from two tabs don't collide (thanks to jittered fractional index).
