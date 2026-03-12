import { NextRequest, NextResponse } from "next/server";
import { createIncident, getBusById } from "@/lib/simEngine";
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
    const { busId, type, severity, description, etaMinutes } =
      body || {};

    if (!busId || !type || !severity || etaMinutes === undefined) {
      return NextResponse.json(
        {
          error:
            "Parámetros requeridos: busId, type, severity, etaMinutes",
        },
        { status: 400 }
      );
    }

    const eta = Number(etaMinutes);
    if (!Number.isFinite(eta) || eta < 0) {
      return NextResponse.json(
        {
          error: "etaMinutes debe ser un número mayor o igual a 0",
        },
        { status: 400 }
      );
    }

    const bus = getBusById(busId);
    if (!bus || bus.companyId !== user.companyId) {
      return NextResponse.json(
        { error: "Micro no pertenece a tu empresa" },
        { status: 403 }
      );
    }

    const incident = createIncident({
      busId,
      type,
      severity,
      description: description ?? "",
      etaMinutes: eta,
    });

    return NextResponse.json({ incident }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "No se pudo crear el incidente" },
      { status: 500 }
    );
  }
}

