/**
 * Persistencia demo: usuarios/empresas extra en disco para sobrevivir refresh.
 * Los datos demo iniciales viven en demoAuth; aquí solo se agregan los creados después.
 */

import fs from "fs";
import path from "path";
import type { Company, User } from "@/lib/demoAuth";

const DATA_DIR = path.join(process.cwd(), ".data");
const EXTRA_FILE = path.join(DATA_DIR, "demo-auth-extra.json");

type ExtraStore = {
  companies: Company[];
  users: User[];
};

function readExtra(): ExtraStore {
  try {
    if (!fs.existsSync(EXTRA_FILE)) return { companies: [], users: [] };
    const raw = fs.readFileSync(EXTRA_FILE, "utf-8");
    const data = JSON.parse(raw) as ExtraStore;
    return {
      companies: Array.isArray(data.companies) ? data.companies : [],
      users: Array.isArray(data.users) ? data.users : [],
    };
  } catch {
    return { companies: [], users: [] };
  }
}

function writeExtra(companies: Company[], users: User[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const payload: ExtraStore = { companies, users };
    fs.writeFileSync(EXTRA_FILE, JSON.stringify(payload, null, 2), "utf-8");
  } catch (e) {
    console.error("demoAuthPersistence write failed", e);
  }
}

/** Carga extras desde disco y los fusiona en los arrays (sin duplicar por email/slug). */
export function hydrateFromDisk(
  companies: Company[],
  users: User[]
): void {
  const extra = readExtra();
  for (const c of extra.companies) {
    if (!companies.some((x) => x.slug === c.slug || x.id === c.id)) {
      companies.push(c);
    }
  }
  for (const u of extra.users) {
    if (!users.some((x) => x.email.toLowerCase() === u.email.toLowerCase())) {
      users.push(u);
    }
  }
}

/** Persiste solo usuarios/empresas que no están en los sets seed (por id prefix o lista). */
export function persistExtras(
  allCompanies: Company[],
  allUsers: User[],
  seedCompanyIds: Set<string>,
  seedUserEmails: Set<string>
): void {
  const companies = allCompanies.filter((c) => !seedCompanyIds.has(c.id));
  const users = allUsers.filter(
    (u) => !seedUserEmails.has(u.email.toLowerCase())
  );
  writeExtra(companies, users);
}

/** Añade un usuario extra al archivo (merge con lo existente). */
export function appendUserExtra(user: User): void {
  const extra = readExtra();
  if (extra.users.some((u) => u.email.toLowerCase() === user.email.toLowerCase())) {
    writeExtra(extra.companies, extra.users);
    return;
  }
  extra.users.push(user);
  writeExtra(extra.companies, extra.users);
}

/** Añade una empresa extra al archivo. */
export function appendCompanyExtra(company: Company): void {
  const extra = readExtra();
  if (extra.companies.some((c) => c.slug === company.slug)) {
    writeExtra(extra.companies, extra.users);
    return;
  }
  extra.companies.push(company);
  writeExtra(extra.companies, extra.users);
}

/** Hidrata desde payload cliente (localStorage) sin borrar seed. */
export function hydrateFromPayload(
  companies: Company[],
  users: User[],
  payload: { companies?: Company[]; users?: User[] }
): void {
  if (payload.companies) {
    for (const c of payload.companies) {
      if (c?.slug && !companies.some((x) => x.slug === c.slug)) {
        companies.push(c);
      }
    }
  }
  if (payload.users) {
    for (const u of payload.users) {
      if (u?.email && !users.some((x) => x.email.toLowerCase() === u.email.toLowerCase())) {
        users.push(u);
      }
    }
  }
}
