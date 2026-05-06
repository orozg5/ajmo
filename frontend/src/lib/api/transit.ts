import { apiFetch } from "./client";

export interface TransitDirectionsResult {
  distance_meters: number;
  duration_seconds: number;
  transit_summary: string;
  geometry: [number, number][];
}

export interface OsrmRouteApiResult {
  distance_meters: number;
  duration_seconds: number;
  geometry: [number, number][];
}

export type OsrmProfileApi = "foot" | "bike" | "driving";

// Backend caps the upstream Transitous call at 12s; give the round-trip a
// little headroom so a slow network can't hold the transit slot in
// useSameDayTransportOptions past a known bound.
const TRANSIT_REQUEST_TIMEOUT_MS = 15_000;

// Backend OSRM client uses 12s per attempt with one retry, so worst-case
// round-trip is around 24s; this cap matches that budget plus a small margin.
const OSRM_REQUEST_TIMEOUT_MS = 25_000;

export const fetchTransitDirections = async (
  src: { lat: number; lng: number },
  dst: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<TransitDirectionsResult | null> => {
  const timeoutSignal = AbortSignal.timeout(TRANSIT_REQUEST_TIMEOUT_MS);
  const composedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const result = await apiFetch<TransitDirectionsResult | undefined>("/transit/directions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      src_lat: src.lat,
      src_lng: src.lng,
      dst_lat: dst.lat,
      dst_lng: dst.lng,
    }),
    signal: composedSignal,
  });
  return result ?? null;
};

export const fetchOsrmRoute = async (
  src: { lat: number; lng: number },
  dst: { lat: number; lng: number },
  profile: OsrmProfileApi,
  signal?: AbortSignal,
): Promise<OsrmRouteApiResult | null> => {
  const timeoutSignal = AbortSignal.timeout(OSRM_REQUEST_TIMEOUT_MS);
  const composedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const result = await apiFetch<OsrmRouteApiResult | undefined>("/transit/osrm-route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile,
      src_lat: src.lat,
      src_lng: src.lng,
      dst_lat: dst.lat,
      dst_lng: dst.lng,
    }),
    signal: composedSignal,
  });
  return result ?? null;
};
