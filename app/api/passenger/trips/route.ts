import { NextRequest, NextResponse } from "next/server";
import {
  getSessionUser,
  getPassengerTickets,
  getCompanyBySlug,
} from "@/lib/demoAuth";
import { getBusById } from "@/lib/simEngine";

const COOKIE = "bus_tracker_session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  const user = getSessionUser(token ?? null);
  if (!user || user.role !== "passenger") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const tickets = getPassengerTickets(user.id).map((t) => {
    const bus = getBusById(t.busId);
    const comp = getCompanyBySlug(t.companySlug);
    return {
      id: t.id,
      ticketCode: t.ticketCode,
      companySlug: t.companySlug,
      companyName: comp?.name ?? t.companySlug,
      tripId: t.tripId,
      busId: t.busId,
      routeName: bus?.routeName ?? "",
    };
  });
  return NextResponse.json({ trips: tickets });
}
