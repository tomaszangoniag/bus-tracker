/**
 * Pasajes creados desde el panel empresa y asociados a un micro.
 * Persistencia en .data/demo-company-tickets.json (mismo patrón que demo-buses-extra).
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "demo-company-tickets.json");

export interface CompanyIssuedTicket {
  id: string;
  ticketCode: string;
  busId: string;
  companyId: string;
  companySlug: string;
  tripId: string;
  passengerName?: string;
  origin?: string;
  destination?: string;
  createdAt: number;
}

type Store = { tickets: CompanyIssuedTicket[] };

function readStore(): Store {
  try {
    if (!fs.existsSync(FILE)) return { tickets: [] };
    const raw = fs.readFileSync(FILE, "utf-8");
    const data = JSON.parse(raw) as Store;
    return { tickets: Array.isArray(data.tickets) ? data.tickets : [] };
  } catch {
    return { tickets: [] };
  }
}

function writeStore(tickets: CompanyIssuedTicket[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ tickets }, null, 2), "utf-8");
  } catch (e) {
    console.error("demoCompanyTicketsPersistence write failed", e);
  }
}

export function loadCompanyTickets(): CompanyIssuedTicket[] {
  return readStore().tickets;
}

export function appendCompanyTicket(t: CompanyIssuedTicket): void {
  const store = readStore();
  if (
    store.tickets.some(
      (x) =>
        x.ticketCode.toUpperCase() === t.ticketCode.toUpperCase() &&
        x.companySlug === t.companySlug
    )
  ) {
    throw new Error("Ya existe un pasaje con ese número para esta empresa");
  }
  store.tickets.push(t);
  writeStore(store.tickets);
}

export function removeCompanyTicket(id: string): boolean {
  const store = readStore();
  const next = store.tickets.filter((t) => t.id !== id);
  if (next.length === store.tickets.length) return false;
  writeStore(next);
  return true;
}

export function listTicketsByBusId(busId: string): CompanyIssuedTicket[] {
  return readStore().tickets.filter((t) => t.busId === busId);
}
