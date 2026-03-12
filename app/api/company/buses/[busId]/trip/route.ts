import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/demoAuth";
import { setBusTripMeta } from "@/lib/simEngine";

const COOKIE = "bus_tracker_session";

/** PATCH — definir/editar código de viaje del micro */
export async function PATCH(
  req: NextRequest,
  context: { params: { busId: string } }
) {
  const token = req.cookies.get(COOKIE)?.value;
  const user = getSessionUser(token ?? null);
  if (!user || user.role !== "company" || !user.companyId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const busId = decodeURIComponent(context.params.busId ?? "");
  let body: {
    tripCode?: string;
    tripOrigin?: string;
    tripDestination?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const tripCode =
    typeof body.tripCode === "string" ? body.tripCode.trim() : "";
  if (!tripCode) {
    return NextResponse.json(
      { error: "Código de viaje obligatorio" },
      { status: 400 }
    );
  }

  const result = setBusTripMeta(
    busId,
    user.companyId,
    tripCode,
    typeof body.tripOrigin === "string" ? body.tripOrigin : undefined,
    typeof body.tripDestination === "string" ? body.tripDestination : undefined
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error?.includes("no encontrado") ? 404 : 400 }
    );
  }
  return NextResponse.json({ ok: true, message: "Código de viaje actualizado" });
}
