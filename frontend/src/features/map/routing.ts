export interface LatLng {
  lat: number;
  lng: number;
}

const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/foot";

interface OsrmRoute {
  geometry?: { coordinates?: [number, number][] };
}

interface OsrmResponse {
  code?: string;
  routes?: OsrmRoute[];
}

export async function fetchWalkingRoute(
  src: LatLng,
  dst: LatLng,
  signal?: AbortSignal,
): Promise<[number, number][] | null> {
  const coords = `${src.lng},${src.lat};${dst.lng},${dst.lat}`;
  const params = new URLSearchParams({ overview: "full", geometries: "geojson" });
  const url = `${OSRM_BASE_URL}/${coords}?${params.toString()}`;

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;
    const payload: OsrmResponse = await response.json();
    if (payload.code !== "Ok") return null;
    const geometry = payload.routes?.[0]?.geometry?.coordinates;
    return geometry && geometry.length > 1 ? geometry : null;
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
