import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/demoAuth";
import {
  loadCompanyTickets,
  removeCompanyTicket,
} from "@/lib/demoCompanyTicketsPersistence";
import { getBusById } from "@/lib/simEngine";

const COOKIE = "bus_tracker_session";

export async function DELETE(
  _req: NextRequest,
  context: { params: { ticketId: string } }
) {
  const token = _req.cookies.get(COOKIE)?.value;
  const user = getSessionUser(token ?? null);
  if (!user || user.role !== "company" || !user.companyId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const ticketId = decodeURIComponent(context.params.ticketId ?? "");
  if (!ticketId) {
    return NextResponse.json({ error: "ticketId requerido" }, { status: 400 });
  }

  const tickets = loadCompanyTickets();
  const t = tickets.find((x) => x.id === ticketId);
  if (!t) {
    return NextResponse.json({ error: "Pasaje no encontrado" }, { status: 404 });
  }
  const bus = getBusById(t.busId);
  if (!bus || bus.companyId !== user.companyId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  if (!removeCompanyTicket(ticketId)) {
    return NextResponse.json({ error: "No se pudo eliminar" }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, message: "Pasaje eliminado correctamente" },
    { status: 200 }
  );
}
