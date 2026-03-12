import { NextRequest, NextResponse } from "next/server";
import {
  createUser,
  createCompany,
  login,
  listCompanies,
  getCompanyBySlug,
} from "@/lib/demoAuth";

const COOKIE = "bus_tracker_session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      email,
      password,
      role,
      companyName,
      companySlug,
      companyId,
    } = body || {};
    if (!name || !email || !password || !role) {
      return NextResponse.json(
        { error: "name, email, password y role requeridos" },
        { status: 400 }
      );
    }
    if (role !== "passenger" && role !== "company") {
      return NextResponse.json({ error: "role inválido" }, { status: 400 });
    }

    let resolvedCompanyId: string | undefined;
    if (role === "company") {
      if (companyId) {
        resolvedCompanyId = companyId;
      } else if (companySlug && companyName) {
        try {
          const c = createCompany(companyName, companySlug);
          resolvedCompanyId = c.id;
        } catch {
          const existing = getCompanyBySlug(companySlug);
          if (existing) resolvedCompanyId = existing.id;
          else throw new Error("No se pudo crear ni encontrar la empresa");
        }
      } else {
        return NextResponse.json(
          {
            error:
              "Empresa: companyId existente, o companyName + companySlug",
          },
          { status: 400 }
        );
      }
    }

    createUser({
      name,
      email,
      password,
      role,
      companyId: resolvedCompanyId,
    });
    const session = login(email, password);
    const res = NextResponse.json({
      ok: true,
      token: session.token,
      companies: role === "company" ? listCompanies() : undefined,
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
      { error: e instanceof Error ? e.message : "Error al registrar" },
      { status: 400 }
    );
  }
}
