import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/demoAuth";

const COOKIE = "bus_tracker_session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body || {};
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email y contraseña requeridos" },
        { status: 400 }
      );
    }
    const session = login(email, password);
    const res = NextResponse.json({
      ok: true,
      token: session.token,
    });
    res.cookies.set(COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error de login" },
      { status: 401 }
    );
  }
}
