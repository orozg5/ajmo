import maplibregl, { Map as MapLibreMap, Marker } from "maplibre-gl";

import { ATTRIBUTION_HTML, MAP_STYLE_URL } from "@/lib/map/style";
import {
  applyHighlight,
  buildHotelMarkerElement,
  buildMarkerElement,
  type MarkerCallbacks,
} from "@/lib/map/markers";

export type MapItemKind = "item" | "hotel";

export interface MapItem {
  id: string;
  lat: number;
  lng: number;
  dayNumber: number;
  label: string;
  kind?: MapItemKind;
}

export type RouteKind = "walk" | "transit";

export interface RouteSegment {
  id: string;
  coordinates: [number, number][];
  kind: RouteKind;
  label?: string;
}

export interface PlanMapController {
  map: MapLibreMap;
  ready: Promise<void>;
  setItems(items: MapItem[]): void;
  setRoutes(routes: RouteSegment[]): void;
  setHighlight(itemId: string | null): void;
  focusItem(itemId: string): void;
  fitToItems(): void;
  destroy(): void;
}

const WALK_SOURCE_ID = "walk-routes";
const TRANSIT_SOURCE_ID = "transit-routes";

export function createPlanMap(
  container: HTMLElement,
  callbacks: MarkerCallbacks,
): PlanMapController {
  const map = new maplibregl.Map({
    container,
    style: MAP_STYLE_URL,
    center: [0, 20],
    zoom: 1,
    attributionControl: false,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(
    new maplibregl.AttributionControl({ customAttribution: ATTRIBUTION_HTML, compact: true }),
    "bottom-right",
  );

  interface TrackedMarker {
    marker: Marker;
    dayNumber: number;
    label: string;
    kind: MapItemKind;
  }
  const markers = new Map<string, TrackedMarker>();

  function buildElementFor(item: MapItem): HTMLElement {
    const kind: MapItemKind = item.kind ?? "item";
    if (kind === "hotel") {
      return buildHotelMarkerElement(item.id, item.label, callbacks);
    }
    return buildMarkerElement(item.id, item.dayNumber, item.label, callbacks);
  }
  let currentItems: MapItem[] = [];
  let pendingRoutes: RouteSegment[] = [];
  let isLoaded = false;
  let highlightedItemId: string | null = null;

  const ready = new Promise<void>((resolve) => {
    map.on("load", () => {
      map.addSource(WALK_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "walk-routes-line",
        type: "line",
        source: WALK_SOURCE_ID,
        paint: {
          "line-color": "#1e6fbf",
          "line-width": 3,
          "line-opacity": 0.75,
        },
      });

      map.addSource(TRANSIT_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "transit-routes-line",
        type: "line",
        source: TRANSIT_SOURCE_ID,
        paint: {
          "line-color": "#8a4a2a",
          "line-width": 2,
          "line-dasharray": [2, 2],
          "line-opacity": 0.8,
        },
      });
      map.addLayer({
        id: "transit-routes-labels",
        type: "symbol",
        source: TRANSIT_SOURCE_ID,
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-allow-overlap": false,
          "symbol-placement": "line-center",
        },
        paint: {
          "text-color": "#3a2518",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
        },
      });

      isLoaded = true;
      if (pendingRoutes.length > 0) {
        writeRoutes(pendingRoutes);
        pendingRoutes = [];
      }
      resolve();
    });
  });

  function writeRoutes(routes: RouteSegment[]): void {
    const walkFeatures = routes
      .filter((r) => r.kind === "walk")
      .map((r) => ({
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: r.coordinates },
        properties: { id: r.id, label: r.label ?? "" },
      }));
    const transitFeatures = routes
      .filter((r) => r.kind === "transit")
      .map((r) => ({
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: r.coordinates },
        properties: { id: r.id, label: r.label ?? "" },
      }));

    const walkSource = map.getSource(WALK_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    const transitSource = map.getSource(TRANSIT_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    walkSource?.setData({ type: "FeatureCollection", features: walkFeatures });
    transitSource?.setData({ type: "FeatureCollection", features: transitFeatures });
  }

  function setItems(items: MapItem[]): void {
    const nextIds = new Set(items.map((i) => i.id));
    for (const [id, tracked] of markers) {
      if (!nextIds.has(id)) {
        tracked.marker.remove();
        markers.delete(id);
      }
    }
    for (const item of items) {
      const kind: MapItemKind = item.kind ?? "item";
      const existing = markers.get(item.id);
      if (existing) {
        existing.marker.setLngLat([item.lng, item.lat]);
        if (
          existing.dayNumber !== item.dayNumber ||
          existing.label !== item.label ||
          existing.kind !== kind
        ) {
          existing.marker.remove();
          const element = buildElementFor(item);
          const marker = new maplibregl.Marker({ element }).setLngLat([item.lng, item.lat]).addTo(map);
          markers.set(item.id, { marker, dayNumber: item.dayNumber, label: item.label, kind });
        }
      } else {
        const element = buildElementFor(item);
        const marker = new maplibregl.Marker({ element }).setLngLat([item.lng, item.lat]).addTo(map);
        markers.set(item.id, { marker, dayNumber: item.dayNumber, label: item.label, kind });
      }
    }
    currentItems = items;
    if (highlightedItemId) setHighlight(highlightedItemId);
  }

  function setRoutes(routes: RouteSegment[]): void {
    if (!isLoaded) {
      pendingRoutes = routes;
      return;
    }
    writeRoutes(routes);
  }

  function setHighlight(itemId: string | null): void {
    for (const [id, tracked] of markers) {
      applyHighlight(tracked.marker.getElement(), id === itemId);
    }
    highlightedItemId = itemId;
  }

  function focusItem(itemId: string): void {
    const item = currentItems.find((i) => i.id === itemId);
    if (!item) return;
    setHighlight(itemId);
    map.flyTo({
      center: [item.lng, item.lat],
      zoom: Math.max(map.getZoom(), 13),
      speed: 1.2,
      essential: true,
    });
  }

  function fitToItems(): void {
    if (currentItems.length === 0) return;
    if (currentItems.length === 1) {
      map.flyTo({ center: [currentItems[0].lng, currentItems[0].lat], zoom: 13, duration: 600 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    for (const item of currentItems) bounds.extend([item.lng, item.lat]);
    map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 600 });
  }

  function destroy(): void {
    for (const tracked of markers.values()) tracked.marker.remove();
    markers.clear();
    map.remove();
  }

  return { map, ready, setItems, setRoutes, setHighlight, focusItem, fitToItems, destroy };
}
