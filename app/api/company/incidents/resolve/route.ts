import { NextRequest, NextResponse } from "next/server";
import {
  resolveIncident,
  getIncidentById,
  getBusById,
} from "@/lib/simEngine";
import { getSessionUser } from "@/lib/demoAuth";

const COOKIE = "bus_tracker_session";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE)?.value;
    const user = getSessionUser(token ?? null);
    if (!user || user.role !== "company" || !user.companyId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { incidentId } = body || {};

    if (!incidentId) {
      return NextResponse.json(
        { error: "Parámetro incidentId requerido" },
        { status: 400 }
      );
    }

    const inc = getIncidentById(incidentId);
    if (inc) {
      const bus = getBusById(inc.busId);
      if (!bus || bus.companyId !== user.companyId) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
    }

    const incident = resolveIncident(incidentId);

    return NextResponse.json({ incident }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "No se pudo resolver el incidente" },
      { status: 500 }
    );
  }
}

