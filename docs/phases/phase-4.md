# Phase 4 — Maps and routing

**Exit bar**: every enrichable item with a resolvable address shows on the map; same-day same-city adjacencies are drawn as walking polylines; intercity transitions drawn as dashed great-circle lines with the LLM-chosen mode label.

**Stack pivot (2026-04-20).** Original plan used MapTiler + OSRM; swapped to the key-free stack — OpenFreeMap tiles, Photon + Nominatim geocoding, FOSSGIS Valhalla walking routing, offline `timezonefinder`. See `docs/DECISIONS.md` entry 2026-04-20.

## In scope

### Geocoding

- [x] Enrichment writes `lat decimal(9,6)`, `lng decimal(9,6)`, `timezone text` on `places` row after LLM returns `canonical_name`. Source: Photon (primary), Nominatim (fallback).
- [x] Cache lat/lng on `places` permanently — never re-geocode a canonical slug. `get_place_by_slug` now selects the extended column set so cache hits carry coords into `EnrichedItem`.
- [x] Backfill command: `python -m scripts.backfill_places_latlng` walks rows with NULL lat/lng and fills them. `--dry-run`, `--limit`, `--sleep-ms` flags.
- [x] LLM lat/lng fields removed from `EnrichmentResponse` — geocoder is the only source of coordinates.

### Map component

- [x] `frontend/src/features/map/PlanMap.tsx` — MapLibre GL JS, OpenFreeMap Liberty style.
- [x] Markers: one per item with lat/lng, coloured by day (OKLCH accent hue via golden-angle hash on `day_number`).
- [x] Clustering on zoom-out via `maplibre-gl` cluster source (built into the init helper at `frontend/src/lib/map/init.ts`).
- [x] Day-filter chips ("All days" / "Active day only") + destination pill toggles above map.
- [x] Zoom-to-fit button (calls `controller.fitToItems()`).

### Routing

- [x] For every same-day same-city adjacency (sorted by `sort_key`), fetch FOSSGIS Valhalla walking route and draw polyline.
- [x] In-memory cache per-hook-lifetime, keyed by adjacency id. No `plan_routes` table yet — v1 keeps it simple.
- [x] For cross-city / cross-day transitions, draw a dashed great-circle line between the last item of the source day and the first item of the destination day. (Mode label hookup deferred — labels currently blank; transport-suggestion join lands in a later polish pass.)

### Cross-highlight

- [x] Hover item card in the editor → matching marker highlights + map flies to it.
- [x] Click marker → scroll item card into view (`scrollIntoView({block: "center"})`) + briefly highlight card via `ring-2 ring-secondary/70`.

### Layout

- [x] Desktop: map fills right column (≥1024px) at `lg:grid-cols-[280px_minmax(0,1fr)_480px]`, sticky top-4, full viewport height.
- [x] Mobile: map opens in a bottom drawer from a floating "Show map" FAB (lg:hidden).

## Out of scope

- Mid-day transit modes beyond walk (Phase 8 or later).
- Turn-by-turn directions.
- Offline tile caching tuning — initial 50MB LRU is set in Phase 7.
- Transport-mode label on intercity great-circle arcs — originally planned as a `useDayTransport` join in `useRoutes`; deferred. After the 2026-05-06 transport rebuild this would now read from `ai_data.{mode,distance_meters,duration_seconds}` on transport `plan_items` directly (no hook needed). See ADR 2026-05-06.

## Verification

- Open a plan with 10+ items → all visible markers; cluster count correct at zoom 3.
- Walking polyline between two same-city adjacent items is a real walkable path (not a straight line).
- Great-circle line between Rome last-of-day and Naples first-of-day (label pending).
- Hover Colosseum card → Colosseum marker bounces within 100ms.
- Backfill dry-run reports how many rows would be updated; actual run completes.
- DevTools Network tab on fresh plan open: zero requests to mapbox.com / maptiler.com / google.com — only `tiles.openfreemap.org`, `photon.komoot.io`, `valhalla1.openstreetmap.de`.
- Attribution control visible bottom-right of map with OSM + OpenFreeMap + Photon + Valhalla links.
