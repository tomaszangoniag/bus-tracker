import { NextResponse } from "next/server";
import { listCompanies } from "@/lib/demoAuth";
import { getCompanyDisplayName } from "@/lib/demoCompanyDisplayPersistence";

/**
 * Lista todas las empresas (seed + creadas en demo/localStorage).
 * Fuente única para /passenger y cualquier selector público.
 * Sin duplicados por slug (slug es único en demoAuth).
 */
export async function GET() {
  const list = listCompanies();
  const seen = new Set<string>();
  const items: { id: string; slug: string; name: string }[] = [];
  for (const c of list) {
    if (seen.has(c.slug)) continue;
    seen.add(c.slug);
    const displayName = getCompanyDisplayName(c.id) ?? c.name;
    items.push({ id: c.id, slug: c.slug, name: displayName });
  }
  return NextResponse.json({ companies: items });
}
