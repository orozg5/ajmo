# Ajmo Build Progress

**How to resume**: this file is the single source of truth for "what's next." Open `docs/phases/phase-N.md` for the active phase and work the first unchecked box. Mark boxes with `[x]` the moment the work lands; add a 1–2 line note underneath so the next session has the rationale. Move onto the next phase only if the user allows it.

Plan file: `C:\Users\TUF\.claude\plans\i-want-to-cosmic-storm.md`
Audit (why we're doing what we're doing): `docs/AUDIT.md`

## Active phase: **Phase 5 — Social**

Phase 4 shipped: key-free map stack (OpenFreeMap tiles, Photon + Nominatim geocoding, offline `timezonefinder`, FOSSGIS Valhalla walking routing); backend geocodes on place upsert and writes `lat/lng/timezone/categories` to `places`; `backfill_places_latlng.py` script for existing rows; frontend `PlanMap` with day-coloured markers, clustering, day/destination filters, fit-to-items, walking polylines + dashed cross-day arcs; bi-directional card ↔ marker cross-highlight; 3-column desktop layout with sticky map, mobile drawer + FAB. See `docs/phases/phase-4.md`.

## Phase tracker

- [x] Phase 0 — Foundation reset
- [x] Phase 1 — AI pipeline fix + transport bug fix
- [x] Phase 2 — UI rebuild
  - Dashboard ships with owner/shared/discover sections, 4-step create-plan wizard with cover upload, themed PlanHeader + itinerary card refresh, settings/profile with avatar upload, preferences redesign.
- [x] Phase 3 — Rich itinerary editing (DnD, hotels, day notes)
  - `sort_key` cutover (backfill + write path), batch reorder endpoint, day PATCH endpoint, hotels CRUD; React-Query-based itinerary hook with optimistic updates, DndContext planner with `DaySidebar` droppable chips (renamed `DayTabs` 2026-05-06), DayNotesEditor autosave, BookStayDialog + HotelBand, ItemCard v2 with thumbnail + key-facts + placeholder reactions.
- [x] Phase 4 — Maps and routing
  - Key-free stack (OpenFreeMap + Photon + Valhalla + `timezonefinder`); geocoding on enrichment; `PlanMap` component with clustering, filters, cross-highlight; 3-col desktop + mobile drawer.
- [x] Phase 4.5 — Cleanup pass (no formal phase)
  - Image source switched to Pexels (was Wikipedia → was LLM); geocoder simplified to Nominatim-only; `plan_items.place_id` FK + read-time JOIN so backfills heal existing items; transport leaves the LLM (`services/transport/cross_city.py` orchestrator over OSRM + Transitous + flight estimator; new `/transit/{directions,osrm-route}` routes; `useDayTransport` split into `useSameDayTransportOptions` + `useSameDayTransportInsert`); generated openapi-ts client deleted, hand-typed shims stay. Plan editor (`EditPlanDialog` + `sync_days` + owner-only PATCH/DELETE) and dashboard rebuild (`HomeHero` + `TripsExplorer`) shipped here. See ADRs 2026-05-04 / 2026-05-05 / 2026-05-06 and `docs/AUDIT.md`.
- [ ] Phase 5 — Social: friends, invites, comments, reactions, ratings (active)
- [ ] Phase 6 — Real-time collaboration (Yjs + Hocuspocus)
- [ ] Phase 7 — Offline + PWA
- [ ] Phase 8 — Onboarding + motion polish
- [ ] Phase 9 — Hardening + observability
