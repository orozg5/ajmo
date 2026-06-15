import { fetchOsrmRoute as fetchOsrmRouteFromBackend } from "@/lib/api";

export interface LatLng {
  lat: number;
  lng: number;
}

export type OsrmProfile = "foot" | "bike" | "driving";

export interface OsrmRouteResult {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
}

export async function fetchOsrmRoute(
  src: LatLng,
  dst: LatLng,
  profile: OsrmProfile,
  signal?: AbortSignal,
): Promise<OsrmRouteResult | null> {
  try {
    const result = await fetchOsrmRouteFromBackend(src, dst, profile, signal);
    if (!result) return null;
    return {
      coordinates: result.geometry,
      distanceMeters: result.distance_meters,
      durationSeconds: result.duration_seconds,
    };
  } catch {
    return null;
  }
}

export function greatCircleLine(src: LatLng, dst: LatLng, segments = 32): [number, number][] {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const lat1 = toRad(src.lat);
  const lng1 = toRad(src.lng);
  const lat2 = toRad(dst.lat);
  const lng2 = toRad(dst.lng);

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2,
      ),
    );

  if (d === 0) return [[src.lng, src.lat]];

  const points: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lng = Math.atan2(y, x);
    points.push([toDeg(lng), toDeg(lat)]);
  }
  return points;
}
