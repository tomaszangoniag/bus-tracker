import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getCompanyById } from "@/lib/demoAuth";
import {
  getCompanyDisplayName,
  setCompanyDisplayName,
} from "@/lib/demoCompanyDisplayPersistence";

const COOKIE = "bus_tracker_session";

/** GET — nombre visible actual (incluye override persistido) */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  const user = getSessionUser(token ?? null);
  if (!user || user.role !== "company" || !user.companyId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const company = getCompanyById(user.companyId);
  if (!company) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }
  const displayName =
    getCompanyDisplayName(user.companyId) ?? company.name;
  return NextResponse.json({
    companyId: company.id,
    slug: company.slug,
    name: displayName,
    seedName: company.name,
  });
}

/** PATCH { name: string } — guarda nombre visible */
export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  const user = getSessionUser(token ?? null);
  if (!user || user.role !== "company" || !user.companyId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const company = getCompanyById(user.companyId);
  if (!company) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Nombre obligatorio" }, { status: 400 });
  }
  setCompanyDisplayName(user.companyId, name);
  return NextResponse.json({ ok: true, name }, { status: 200 });
}
