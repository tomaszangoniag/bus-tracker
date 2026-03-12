import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getCompanyById } from "@/lib/demoAuth";
import { addCustomBus } from "@/lib/simEngine";

const COOKIE = "bus_tracker_session";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  const user = getSessionUser(token ?? null);
  if (!user || user.role !== "company" || !user.companyId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const company = getCompanyById(user.companyId);
  if (!company) {
    return NextResponse.json(
      { error: "Empresa no encontrada" },
      { status: 400 }
    );
  }

  let body: {
    unitId?: string;
    plate?: string;
    driverName?: string;
    gpsType?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const plate = typeof body.plate === "string" ? body.plate.trim() : "";
  if (!plate) {
    return NextResponse.json(
      { error: "La patente es obligatoria" },
      { status: 400 }
    );
  }

  const gpsType =
    body.gpsType === "external" ? "external" : "mobile";

  try {
    const bus = addCustomBus(
      company.id,
      company.slug,
      company.name,
      {
        unitId:
          typeof body.unitId === "string" ? body.unitId : undefined,
        plate,
        driverName:
          typeof body.driverName === "string"
            ? body.driverName
            : undefined,
        gpsType,
      }
    );
    return NextResponse.json(
      {
        ok: true,
        message: "Micro agregado correctamente",
        bus: {
          id: bus.id,
          unitId: bus.unitId,
          plate: bus.plate,
          driverName: bus.driverName,
          gpsType: bus.gpsType,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al crear micro";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
