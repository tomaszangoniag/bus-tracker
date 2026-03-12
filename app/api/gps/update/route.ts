import { NextRequest, NextResponse } from "next/server";
import { applyMobileGpsUpdate } from "@/lib/simEngine";

/**
 * POST /api/gps/update
 * Body: { busId: string, lat: number, lng: number }
 * El busId debe ser exactamente el id del micro (ej. bus-custom-1738...).
 * Solo acepta actualizaciones para micros con gpsType === "mobile".
 */
export async function POST(req: NextRequest) {
  let body: { busId?: string; lat?: number; lng?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const busId = typeof body.busId === "string" ? body.busId.trim() : "";
  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
  const lng = typeof body.lng === "number" ? body.lng : Number(body.lng);

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

  const result = applyMobileGpsUpdate(busId, lat, lng);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "No se pudo actualizar" },
      { status: result.error === "Bus no encontrado" ? 404 : 400 }
    );
  }

  return NextResponse.json({ ok: true, busId, lat, lng }, { status: 200 });
}
