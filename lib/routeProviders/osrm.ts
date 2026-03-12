export interface LatLng {
  lat: number;
  lng: number;
}

// Respuesta parcial de OSRM (sólo lo que necesitamos)
interface OsrmResponse {
  routes: Array<{
    geometry?: {
      coordinates: [number, number][];
    };
  }>;
}

/**
 * Obtiene una ruta real por carretera usando el servidor público de OSRM.
 * Devuelve un array de { lat, lng } que representa la polyline.
 */
export async function getRoadRoute(
  origin: LatLng,
  dest: LatLng
): Promise<LatLng[]> {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OSRM error: ${res.status}`);
  }

  const data = (await res.json()) as OsrmResponse;
  const firstRoute = data.routes?.[0];
  const coords = firstRoute?.geometry?.coordinates;

  if (!coords || coords.length === 0) {
    throw new Error("OSRM sin geometría de ruta");
  }

  return coords.map(([lng, lat]) => ({ lat, lng }));
}

