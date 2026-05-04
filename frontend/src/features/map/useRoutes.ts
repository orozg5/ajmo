"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { RouteSegment } from "@/lib/map/init";

import { fetchWalkingRoute, greatCircleLine } from "@/features/map/routing";
import type { MapAdjacency } from "@/features/map/useMapState";

type WalkCache = Map<string, [number, number][] | null>;

export interface UseRoutesOptions {
  adjacencies: MapAdjacency[];
}

export interface UseRoutesReturn {
  routes: RouteSegment[];
  isFetching: boolean;
}

function buildSyncRoutes(adjacencies: MapAdjacency[], cache: WalkCache): {
  routes: RouteSegment[];
  toFetch: MapAdjacency[];
} {
  const transitSegments: RouteSegment[] = adjacencies
    .filter((adj) => adj.kind === "transit")
    .map((adj) => ({
      id: adj.id,
      coordinates: greatCircleLine(
        { lat: adj.src.lat, lng: adj.src.lng },
        { lat: adj.dst.lat, lng: adj.dst.lng },
      ),
      kind: "transit" as const,
      label: adj.label,
    }));

  const walkAdjacencies = adjacencies.filter((adj) => adj.kind === "walk");
  const cachedWalk: RouteSegment[] = [];
  const toFetch: MapAdjacency[] = [];

  for (const adj of walkAdjacencies) {
    const cached = cache.get(adj.id);
    if (cached !== undefined) {
      if (cached !== null) {
        cachedWalk.push({
          id: adj.id,
          coordinates: cached,
          kind: "walk",
          label: adj.label,
        });
      } else {
        cachedWalk.push({
          id: adj.id,
          coordinates: [
            [adj.src.lng, adj.src.lat],
            [adj.dst.lng, adj.dst.lat],
          ],
          kind: "transit",
        });
      }
    } else {
      toFetch.push(adj);
    }
  }

  return { routes: [...cachedWalk, ...transitSegments], toFetch };
}

export function useRoutes({ adjacencies }: UseRoutesOptions): UseRoutesReturn {
  const cacheRef = useRef<WalkCache>(new Map());
  const [fetchedIdsTick, setFetchedIdsTick] = useState(0);
  const [isFetching, setIsFetching] = useState(false);

  const { routes, toFetch } = useMemo(
    () => buildSyncRoutes(adjacencies, cacheRef.current),
    // `fetchedIdsTick` triggers re-derivation after async walk routes land in the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adjacencies, fetchedIdsTick],
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
        const coords = await fetchWalkingRoute(
          { lat: adj.src.lat, lng: adj.src.lng },
          { lat: adj.dst.lat, lng: adj.dst.lng },
          controller.signal,
        );
        cacheRef.current.set(adj.id, coords);
      }),
    ).then(() => {
      if (cancelled) return;
      setIsFetching(false);
      setFetchedIdsTick((tick) => tick + 1);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [toFetch]);

  return { routes, isFetching };
}
