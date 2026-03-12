import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getCompanyById } from "@/lib/demoAuth";
import { getBusById } from "@/lib/simEngine";
import {
  appendCompanyTicket,
  listTicketsByBusId,
  type CompanyIssuedTicket,
} from "@/lib/demoCompanyTicketsPersistence";

const COOKIE = "bus_tracker_session";

/** GET ?busId=... — lista pasajes del micro (empresa actual) */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  const user = getSessionUser(token ?? null);
  if (!user || user.role !== "company" || !user.companyId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const busId = req.nextUrl.searchParams.get("busId")?.trim() ?? "";
  if (!busId) {
    return NextResponse.json({ error: "busId requerido" }, { status: 400 });
  }
  const bus = getBusById(busId);
  if (!bus || bus.companyId !== user.companyId) {
    return NextResponse.json({ error: "Micro no encontrado" }, { status: 404 });
  }
  const tickets = listTicketsByBusId(busId);
  return NextResponse.json({ tickets }, { status: 200 });
}

/** POST — crear pasaje asociado al micro */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  const user = getSessionUser(token ?? null);
  if (!user || user.role !== "company" || !user.companyId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const company = getCompanyById(user.companyId);
  if (!company) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 400 });
  }

  let body: {
    busId?: string;
    ticketCode?: string;
    passengerName?: string;
    origin?: string;
    destination?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const busId = typeof body.busId === "string" ? body.busId.trim() : "";
  const ticketCode =
    typeof body.ticketCode === "string" ? body.ticketCode.trim() : "";
  if (!busId || !ticketCode) {
    return NextResponse.json(
      { error: "busId y número de pasaje son obligatorios" },
      { status: 400 }
    );
  }

  const bus = getBusById(busId);
  if (!bus || bus.companyId !== user.companyId) {
    return NextResponse.json({ error: "Micro no encontrado" }, { status: 404 });
  }

  const ticket: CompanyIssuedTicket = {
    id: `ct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ticketCode: ticketCode.toUpperCase(),
    busId: bus.id,
    companyId: company.id,
    companySlug: company.slug,
    tripId: bus.tripId,
    passengerName:
      typeof body.passengerName === "string"
        ? body.passengerName.trim() || undefined
        : undefined,
    origin:
      typeof body.origin === "string" ? body.origin.trim() || undefined : undefined,
    destination:
      typeof body.destination === "string"
        ? body.destination.trim() || undefined
        : undefined,
    createdAt: Date.now(),
  };

  try {
    appendCompanyTicket(ticket);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo guardar";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json(
    { ok: true, message: "Pasaje creado correctamente", ticket },
    { status: 201 }
  );
}
