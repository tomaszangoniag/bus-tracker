import { NextRequest, NextResponse } from "next/server";
import { logout } from "@/lib/demoAuth";

const COOKIE = "bus_tracker_session";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (token) logout(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
