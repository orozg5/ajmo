"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { RouteKind, RouteSegment } from "@/lib/map/init";

import { fetchOsrmRoute, greatCircleLine, type OsrmProfile } from "@/features/map/routing";
import type { MapAdjacency } from "@/features/map/useMapState";

type OsrmCache = Map<string, [number, number][] | null>;

export interface UseRoutesOptions {
  adjacencies: MapAdjacency[];
}

export interface UseRoutesReturn {
  routes: RouteSegment[];
  isFetching: boolean;
}

const OSRM_PROFILE_BY_KIND: Partial<Record<RouteKind, OsrmProfile>> = {
  walk: "foot",
  bike: "bike",
  drive: "driving",
};

function cacheKey(adj: MapAdjacency): string {
  return `${adj.kind}:${adj.id}`;
}

interface SyncResult {
  routes: RouteSegment[];
  toFetch: MapAdjacency[];
}

function buildSyncRoutes(adjacencies: MapAdjacency[], cache: OsrmCache): SyncResult {
  const routes: RouteSegment[] = [];
  const toFetch: MapAdjacency[] = [];

  for (const adj of adjacencies) {
    if (adj.geometry && adj.geometry.length > 1) {
      routes.push({ id: adj.id, coordinates: adj.geometry, kind: adj.kind, label: adj.label });
      continue;
    }
    if (adj.kind === "intercity") {
      routes.push({
        id: adj.id,
        coordinates: greatCircleLine(
          { lat: adj.src.lat, lng: adj.src.lng },
          { lat: adj.dst.lat, lng: adj.dst.lng },
        ),
        kind: "intercity",
        label: adj.label,
      });
      continue;
    }
    if (adj.kind === "transit") {
      // Transit without persisted geometry means the data is missing — skip rather
      // than show a misleading straight line.
      continue;
    }
    const profile = OSRM_PROFILE_BY_KIND[adj.kind];
    if (!profile) continue;

    const cached = cache.get(cacheKey(adj));
    if (cached !== undefined) {
      if (cached !== null) {
        routes.push({ id: adj.id, coordinates: cached, kind: adj.kind, label: adj.label });
      }
      continue;
    }
    toFetch.push(adj);
  }

  return { routes, toFetch };
}

export function useRoutes({ adjacencies }: UseRoutesOptions): UseRoutesReturn {
  const cacheRef = useRef<OsrmCache>(new Map());
  const [fetchedTick, setFetchedTick] = useState(0);
  const [isFetching, setIsFetching] = useState(false);

  const { routes, toFetch } = useMemo(
    () => buildSyncRoutes(adjacencies, cacheRef.current),
    // `fetchedTick` triggers re-derivation after async OSRM routes land in the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adjacencies, fetchedTick],
  );

  useEffect(() => {
    if (toFetch.length === 0) {
      setIsFetching(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setIsFetching(true);

    void Promise.all(
      toFetch.map(async (adj) => {
        const profile = OSRM_PROFILE_BY_KIND[adj.kind];
        if (!profile) return;
        const result = await fetchOsrmRoute(
          { lat: adj.src.lat, lng: adj.src.lng },
          { lat: adj.dst.lat, lng: adj.dst.lng },
          profile,
          controller.signal,
        );
        cacheRef.current.set(cacheKey(adj), result?.coordinates ?? null);
      }),
    ).then(() => {
      if (cancelled) return;
      setIsFetching(false);
      setFetchedTick((tick) => tick + 1);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [toFetch]);

  return { routes, isFetching };
}
