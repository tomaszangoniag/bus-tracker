/**
 * Persistencia demo: micros creados por empresa en disco (mismo patrón que demo-auth-extra).
 * Sobrevive refresh en dev; en serverless el archivo puede ser efímero.
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".data");
const BUSES_FILE = path.join(DATA_DIR, "demo-buses-extra.json");

export type GpsType = "mobile" | "external";

/** Subset serializable de BusState para micros custom */
export interface PersistedCustomBus {
  id: string;
  unitId: string;
  plate: string;
  routeName: string;
  companySlug: string;
  companyId: string;
  company: string;
  tripId: string;
  ticketCode: string;
  routeId: string;
  /** null si GPS móvil aún sin conexión */
  lat: number | null;
  lng: number | null;
  routeIdx: number;
  speedKmh: number;
  status: string;
  updatedAt: number;
  driverName?: string;
  gpsType?: GpsType;
}

type Store = { buses: PersistedCustomBus[] };

function readStore(): Store {
  try {
    if (!fs.existsSync(BUSES_FILE)) return { buses: [] };
    const raw = fs.readFileSync(BUSES_FILE, "utf-8");
    const data = JSON.parse(raw) as Store;
    return {
      buses: Array.isArray(data.buses) ? data.buses : [],
    };
  } catch {
    return { buses: [] };
  }
}

function writeStore(buses: PersistedCustomBus[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(
      BUSES_FILE,
      JSON.stringify({ buses }, null, 2),
      "utf-8"
    );
  } catch (e) {
    console.error("demoBusesPersistence write failed", e);
  }
}

export function loadCustomBuses(): PersistedCustomBus[] {
  return readStore().buses;
}

export function appendCustomBus(bus: PersistedCustomBus): void {
  const store = readStore();
  if (store.buses.some((b) => b.id === bus.id)) return;
  store.buses.push(bus);
  writeStore(store.buses);
}

/** Quita un micro persistido por id (si existe). */
export function removeCustomBus(busId: string): void {
  const store = readStore();
  const next = store.buses.filter((b) => b.id !== busId);
  if (next.length === store.buses.length) return;
  writeStore(next);
}
