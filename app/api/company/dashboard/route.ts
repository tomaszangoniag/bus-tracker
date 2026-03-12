import { NextRequest, NextResponse } from "next/server";
import { getAllBuses, hydrateRoadRoutesForCompany } from "@/lib/simEngine";
import { getSessionUser } from "@/lib/demoAuth";

const COOKIE = "bus_tracker_session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  const user = getSessionUser(token ?? null);
  if (!user || user.role !== "company" || !user.companyId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  // Misma polyline OSRM que /passenger: hidratar rutas antes de leer waypoints
  await hydrateRoadRoutesForCompany(user.companyId);
  const buses = getAllBuses(user.companyId);
  return NextResponse.json({ buses }, { status: 200 });
}
