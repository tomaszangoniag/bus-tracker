import { NextRequest, NextResponse } from "next/server";
import { applyMobileGpsUpdate } from "@/lib/simEngine";

/**
 * POST /api/gps/update
 * Body: { busId, lat, lng, speed?: number (m/s), timestamp?: number }
 * speed en m/s (como coords.speed de Geolocation) se convierte a km/h en servidor.
 */
export async function POST(req: NextRequest) {
  let body: {
    busId?: string;
    lat?: number;
    lng?: number;
    speed?: number;
    timestamp?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const busId = typeof body.busId === "string" ? body.busId.trim() : "";
  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
  const lng = typeof body.lng === "number" ? body.lng : Number(body.lng);
  const timestamp =
    typeof body.timestamp === "number" && Number.isFinite(body.timestamp)
      ? body.timestamp
      : Date.now();
  // GeolocationPosition.coords.speed es m/s; opcional
  const speedMs =
    typeof body.speed === "number" && Number.isFinite(body.speed)
      ? body.speed
      : undefined;
  const speedKmh =
    speedMs != null && speedMs >= 0 ? speedMs * 3.6 : undefined;

  if (!busId) {
    return NextResponse.json(
      { error: "busId requerido (id exacto del micro)" },
      { status: 400 }
    );
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "lat y lng numéricos requeridos" },
      { status: 400 }
    );
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "lat/lng fuera de rango" }, { status: 400 });
  }

  const result = applyMobileGpsUpdate(busId, lat, lng, {
    speedKmh,
    timestamp,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "No se pudo actualizar" },
      { status: result.error === "Bus no encontrado" ? 404 : 400 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      busId,
      lat,
      lng,
      speedKmh: speedKmh ?? null,
      timestamp,
    },
    { status: 200 }
  );
}
