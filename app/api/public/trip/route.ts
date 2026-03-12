import { NextRequest, NextResponse } from "next/server";
import {
  getTripByTicketAndCompany,
  applyRoadRouteForBus,
  getBusById,
} from "@/lib/simEngine";
import { getOrFetchRoadRoute } from "@/lib/roadRouteShared";
import { getSessionUser, getPassengerTicket } from "@/lib/demoAuth";

const COOKIE = "bus_tracker_session";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripCodeParam =
    searchParams.get("tripCode") ?? searchParams.get("ticket");
  const company = searchParams.get("company");

  if (!tripCodeParam || !company) {
    return NextResponse.json(
      { error: "Parámetros código de viaje (tripCode o ticket) y company requeridos" },
      { status: 400 }
    );
  }
  const ticket = tripCodeParam;

  const token = req.cookies.get(COOKIE)?.value;
  const user = getSessionUser(token ?? null);
  if (user?.role === "passenger") {
    const pt = getPassengerTicket(user.id, ticket);
    if (!pt || pt.companySlug !== company) {
      return NextResponse.json(
        { error: "Ticket no asociado a tu cuenta" },
        { status: 403 }
      );
    }
  }

  const trip = getTripByTicketAndCompany(ticket, company);

  if (!trip) {
    return NextResponse.json(
      {
        error:
          "No se encontró el viaje. Verificá el código de viaje y la empresa.",
      },
      { status: 404 }
    );
  }

  let finalTrip = trip;

  try {
    // GPS móvil: no OSRM ni polyline demo; solo historial real
    const busState = getBusById(trip.bus.id);
    if (busState?.gpsType === "mobile") {
      finalTrip = getTripByTicketAndCompany(ticket, company) ?? trip;
    } else {
      const route = trip.routeWaypoints ?? trip.bus.waypoints;
      if (route && route.length >= 2) {
        const origin = route[0];
        const dest = route[route.length - 1];
        const road = await getOrFetchRoadRoute(origin, dest);
        applyRoadRouteForBus(trip.bus.id, road);
        finalTrip = getTripByTicketAndCompany(ticket, company) ?? {
          ...trip,
          routeWaypoints: road,
        };
      }
    }
  } catch (e) {
    // Fallback silencioso: mantenemos los waypoints lineales actuales
    console.error("OSRM route fallback:", e);
  }

  return NextResponse.json(finalTrip, { status: 200 });
}
