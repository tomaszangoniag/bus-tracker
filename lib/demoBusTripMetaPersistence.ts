/**
 * Código de viaje y origen/destino por busId (todos los micros, no solo custom).
 * .data/demo-bus-trip-meta.json
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "demo-bus-trip-meta.json");

export interface BusTripMeta {
  busId: string;
  tripCode: string;
  tripOrigin?: string;
  tripDestination?: string;
}

type Store = { meta: BusTripMeta[] };

function readStore(): Store {
  try {
    if (!fs.existsSync(FILE)) return { meta: [] };
    const raw = fs.readFileSync(FILE, "utf-8");
    const data = JSON.parse(raw) as Store;
    return { meta: Array.isArray(data.meta) ? data.meta : [] };
  } catch {
    return { meta: [] };
  }
}

function writeStore(meta: BusTripMeta[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ meta }, null, 2), "utf-8");
  } catch (e) {
    console.error("demoBusTripMetaPersistence write failed", e);
  }
}

export function loadAllTripMeta(): BusTripMeta[] {
  return readStore().meta;
}

export function getTripMeta(busId: string): BusTripMeta | undefined {
  return readStore().meta.find((m) => m.busId === busId);
}

export function removeTripMetaForBus(busId: string): void {
  const store = readStore();
  const next = store.meta.filter((m) => m.busId !== busId);
  if (next.length === store.meta.length) return;
  writeStore(next);
}

export function upsertTripMeta(entry: BusTripMeta): void {
  const store = readStore();
  const idx = store.meta.findIndex((m) => m.busId === entry.busId);
  if (idx >= 0) store.meta[idx] = entry;
  else store.meta.push(entry);
  writeStore(store.meta);
}
