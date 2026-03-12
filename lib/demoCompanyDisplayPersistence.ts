/**
 * Nombre visible de empresa por companyId (sobrescribe el name del seed).
 * .data/demo-company-display.json
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "demo-company-display.json");

type Store = { names: Record<string, string> };

function readStore(): Store {
  try {
    if (!fs.existsSync(FILE)) return { names: {} };
    const raw = fs.readFileSync(FILE, "utf-8");
    const data = JSON.parse(raw) as Store;
    return {
      names:
        data.names && typeof data.names === "object" ? data.names : {},
    };
  } catch {
    return { names: {} };
  }
}

function writeStore(names: Record<string, string>): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ names }, null, 2), "utf-8");
  } catch (e) {
    console.error("demoCompanyDisplayPersistence write failed", e);
  }
}

export function getCompanyDisplayName(companyId: string): string | undefined {
  const n = readStore().names[companyId];
  return typeof n === "string" && n.trim() ? n.trim() : undefined;
}

export function setCompanyDisplayName(companyId: string, name: string): void {
  const store = readStore();
  store.names[companyId] = name.trim();
  writeStore(store.names);
}
