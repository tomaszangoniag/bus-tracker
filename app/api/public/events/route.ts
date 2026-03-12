import { NextRequest, NextResponse } from "next/server";
import { getEventsForTrip } from "@/lib/simEngine";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");

  if (!tripId) {
    return NextResponse.json(
      { error: "Parámetro tripId requerido" },
      { status: 400 }
    );
  }

  const events = getEventsForTrip(tripId, 10);

  return NextResponse.json({ events }, { status: 200 });
}

