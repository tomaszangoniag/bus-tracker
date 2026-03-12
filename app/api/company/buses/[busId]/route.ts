import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/demoAuth";
import { deleteBusForCompany } from "@/lib/simEngine";

const COOKIE = "bus_tracker_session";

/**
 * DELETE /api/company/buses/[busId]
 * Solo micros bus-custom-* de la empresa logueada.
 */
export async function DELETE(
  _req: NextRequest,
  context: { params: { busId: string } }
) {
  const token = _req.cookies.get(COOKIE)?.value;
  const user = getSessionUser(token ?? null);
  if (!user || user.role !== "company" || !user.companyId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { busId } = context.params;
  const id = typeof busId === "string" ? decodeURIComponent(busId) : "";
  if (!id) {
    return NextResponse.json({ error: "busId requerido" }, { status: 400 });
  }

  const result = deleteBusForCompany(id, user.companyId);
  if (!result.ok) {
    const status =
      result.error === "Micro no encontrado"
        ? 404
        : result.error?.includes("no pertenece")
          ? 403
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    { ok: true, message: "Micro eliminado correctamente" },
    { status: 200 }
  );
}
