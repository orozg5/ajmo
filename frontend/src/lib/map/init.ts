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

export type RouteKind = "walk" | "bike" | "drive" | "transit" | "intercity";

export interface RouteSegment {
  id: string;
  coordinates: [number, number][];
  kind: RouteKind;
  label?: string;
}

const ROUTE_STYLE: Record<RouteKind, { color: string; width: number; dasharray?: [number, number] }> = {
  walk: { color: "#1e6fbf", width: 3 },
  bike: { color: "#2d8f4d", width: 3 },
  drive: { color: "#d97f3a", width: 3 },
  transit: { color: "#7b3fa3", width: 3 },
  intercity: { color: "#8a4a2a", width: 2, dasharray: [2, 2] },
};

const ROUTE_KINDS: RouteKind[] = ["walk", "bike", "drive", "transit", "intercity"];

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

function sourceIdFor(kind: RouteKind): string {
  return `${kind}-routes`;
}

function lineLayerIdFor(kind: RouteKind): string {
  return `${kind}-routes-line`;
}

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
      for (const kind of ROUTE_KINDS) {
        const sourceId = sourceIdFor(kind);
        const style = ROUTE_STYLE[kind];

        map.addSource(sourceId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        const paint: Record<string, unknown> = {
          "line-color": style.color,
          "line-width": style.width,
          "line-opacity": 0.8,
        };
        if (style.dasharray) {
          paint["line-dasharray"] = style.dasharray;
        }
        map.addLayer({
          id: lineLayerIdFor(kind),
          type: "line",
          source: sourceId,
          paint,
        });
      }

      map.addLayer({
        id: "intercity-routes-labels",
        type: "symbol",
        source: sourceIdFor("intercity"),
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
    for (const kind of ROUTE_KINDS) {
      const features = routes
        .filter((r) => r.kind === kind)
        .map((r) => ({
          type: "Feature" as const,
          geometry: { type: "LineString" as const, coordinates: r.coordinates },
          properties: { id: r.id, label: r.label ?? "" },
        }));
      const source = map.getSource(sourceIdFor(kind)) as maplibregl.GeoJSONSource | undefined;
      source?.setData({ type: "FeatureCollection", features });
    }
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
