import type { LatLng } from "@/lib/routeProviders/osrm";
import { getRoadRoute } from "@/lib/routeProviders/osrm";

/**
 * Caché compartida entre /api/public/trip y /api/company/dashboard
 * para que la polyline OSRM sea la misma fuente y no se recalcule en línea recta.
 */
const roadRouteCache = new Map<string, LatLng[]>();

export function makeRouteKey(origin: LatLng, dest: LatLng): string {
  const o = `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}`;
  const d = `${dest.lat.toFixed(4)},${dest.lng.toFixed(4)}`;
  return `${o}-${d}`;
}

/**
 * Devuelve la polyline por calles (OSRM) para origen→destino, usando caché.
 * Misma lógica que el trip del pasajero.
 */
export async function getOrFetchRoadRoute(
  origin: LatLng,
  dest: LatLng
): Promise<LatLng[]> {
  const key = makeRouteKey(origin, dest);
  let road = roadRouteCache.get(key);
  if (!road) {
    road = await getRoadRoute(origin, dest);
    roadRouteCache.set(key, road);
  }
  return road;
}
