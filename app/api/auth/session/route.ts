import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getCompanyById } from "@/lib/demoAuth";

const COOKIE = "bus_tracker_session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  const user = getSessionUser(token ?? null);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  const company = user.companyId
    ? getCompanyById(user.companyId)
    : undefined;
  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      company: company
        ? { id: company.id, name: company.name, slug: company.slug }
        : null,
    },
  });
}
