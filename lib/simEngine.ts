/**
 * Motor de simulación en memoria: buses que se mueven por rutas reales (waypoints).
 * Cada ~3s (en cada lectura) se avanza un tick y se actualizan posiciones.
 */

import { getOrFetchRoadRoute } from "@/lib/roadRouteShared";

export type BusStatus = "NORMAL" | "DELAY" | "INCIDENT";

export type CompanyName = "FlechaBus" | "Plusmar" | "RutaAtlantica";

export interface Waypoint {
  lat: number;
  lng: number;
}

export interface SimRoute {
  id: string;
  name: string;
  waypoints: Waypoint[];
}

export interface BusState {
  id: string;
  unitId: string;
  plate: string;
  routeName: string;
  /** Slug empresa (ej. flechabus) para API trip */
  companySlug: string;
  companyId: string;
  /** Nombre legado para UI */
  company: CompanyName;
  tripId: string;
  ticketCode: string;
  routeId: string;
  /** null = GPS móvil aún sin fix (no usar ruta demo) */
  lat: number | null;
  lng: number | null;
  routeIdx: number;
  speedKmh: number;
  status: BusStatus;
  updatedAt: number;
  activeIncidentId?: string;
  /** Chofer / responsable (micros creados desde panel empresa) */
  driverName?: string;
  /** GPS celular vs externo */
  gpsType?: "mobile" | "external";
}

export type IncidentSeverity = "low" | "medium" | "high";

export interface Incident {
  id: string;
  busId: string;
  type: string;
  severity: IncidentSeverity;
  description: string;
  etaMinutes: number;
  createdAt: number;
  resolvedAt?: number;
}

export interface EventLog {
  id: string;
  tripId: string;
  busId: string;
  type: string;
  message: string;
  createdAt: number;
}

const now = () => Date.now();
const TICK_MS = 3000;
const DESVIO_THRESHOLD_M = 500;
let lastTickAt = now();

/** Distancia en km entre dos puntos (fórmula de Haversine). */
function haversineKm(a: Waypoint, b: Waypoint): number {
  const R = 6371; // radio Tierra en km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

/** Distancia en metros desde un punto al segmento A-B (proyección sobre el segmento, aproximación en lat/lng). */
function distancePointToSegmentM(p: Waypoint, a: Waypoint, b: Waypoint): number {
  const dlat = b.lat - a.lat;
  const dlng = b.lng - a.lng;
  const denom = dlat * dlat + dlng * dlng;
  if (denom < 1e-12) return haversineKm(p, a) * 1000;
  let t = ((p.lat - a.lat) * dlat + (p.lng - a.lng) * dlng) / denom;
  t = Math.max(0, Math.min(1, t));
  const proj: Waypoint = {
    lat: a.lat + t * dlat,
    lng: a.lng + t * dlng,
  };
  return haversineKm(p, proj) * 1000;
}

/** Distancia mínima en metros desde un punto a la polyline (ruta). */
function distancePointToRouteM(point: Waypoint, waypoints: Waypoint[]): number {
  if (waypoints.length < 2) return 0;
  let minM = Infinity;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const d = distancePointToSegmentM(point, waypoints[i], waypoints[i + 1]);
    if (d < minM) minM = d;
  }
  return minM;
}

/** Distancia restante en km desde la posición actual hasta el destino siguiendo los waypoints. */
function remainingDistanceKm(
  current: Waypoint,
  waypoints: Waypoint[],
  fromIdx: number
): number {
  if (fromIdx >= waypoints.length - 1) return 0;
  let km = haversineKm(current, waypoints[fromIdx + 1]);
  for (let i = fromIdx + 1; i < waypoints.length - 1; i++) {
    km += haversineKm(waypoints[i], waypoints[i + 1]);
  }
  return km;
}

function buildWaypoints(from: Waypoint, to: Waypoint, steps: number): Waypoint[] {
  const points: Waypoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t,
    });
  }
  return points;
}

const BUENOS_AIRES: Waypoint = { lat: -34.6037, lng: -58.3816 };
const MAR_DEL_PLATA: Waypoint = { lat: -38.0055, lng: -57.5426 };
const ROSARIO: Waypoint = { lat: -32.9442, lng: -60.6505 };
const CORDOBA: Waypoint = { lat: -31.4201, lng: -64.1888 };

/** Ruta sin waypoints: micros con GPS móvil no usan simulación ni polyline demo */
const ROUTE_MOBILE_GPS_ID = "route-mobile-gps";

const ROUTES: SimRoute[] = [
  {
    id: ROUTE_MOBILE_GPS_ID,
    name: "GPS móvil (posición en vivo)",
    waypoints: [],
  },
  {
    id: "route-ba-mdp",
    name: "Buenos Aires – Mar del Plata",
    waypoints: buildWaypoints(BUENOS_AIRES, MAR_DEL_PLATA, 30),
  },
  {
    id: "route-ba-rosario",
    name: "Buenos Aires – Rosario",
    waypoints: buildWaypoints(BUENOS_AIRES, ROSARIO, 25),
  },
  {
    id: "route-ba-cordoba",
    name: "Buenos Aires – Córdoba",
    waypoints: buildWaypoints(BUENOS_AIRES, CORDOBA, 35),
  },
];

function getRouteById(routeId: string): SimRoute | undefined {
  return ROUTES.find((r) => r.id === routeId);
}

/**
 * Construye un Waypoint válido sin usar null.
 * Micros mobile sin GPS aún no llegan aquí (getTrip devuelve null antes).
 * Si lat/lng faltan (estado inconsistente), usa primer punto de ruta o fallback.
 */
function waypointFromBusOrFallback(bus: BusState): Waypoint {
  if (
    bus.lat != null &&
    bus.lng != null &&
    Number.isFinite(bus.lat) &&
    Number.isFinite(bus.lng)
  ) {
    return { lat: bus.lat, lng: bus.lng };
  }
  const route = getRouteById(bus.routeId);
  const first = route?.waypoints?.[0];
  if (first) return first;
  return BUENOS_AIRES;
}

/** Rutas cuya polyline ya fue reemplazada por OSRM (evita re-mapear idx al re-aplicar). */
const roadHydratedRouteIds = new Set<string>();

const buses = new Map<string, BusState>();
const incidents: Incident[] = [];
const events: EventLog[] = [];
/** Buses que están en estado "desvío" (alejados de la ruta > 500m). */
const desvioActive = new Map<string, boolean>();

function randomSpeed(base: number): number {
  const delta = (Math.random() - 0.5) * 10;
  return Math.max(60, Math.min(110, base + delta));
}

/** Añade un offset aleatorio en metros (para simular desvío ocasional). */
function addRandomOffsetM(bus: BusState, maxMeters: number): void {
  if (maxMeters <= 0) return;
  if (bus.lat == null || bus.lng == null) return;
  const distKm = (Math.random() * maxMeters) / 1000;
  const bearing = Math.random() * 2 * Math.PI;
  const R = 6371;
  const lat1 = (bus.lat * Math.PI) / 180;
  const lng1 = (bus.lng * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distKm / R) +
      Math.cos(lat1) * Math.sin(distKm / R) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(distKm / R) * Math.cos(lat1),
      Math.cos(distKm / R) - Math.sin(lat1) * Math.sin(lat2)
    );
  bus.lat = (lat2 * 180) / Math.PI;
  bus.lng = (lng2 * 180) / Math.PI;
}

/** Historial de posiciones reales por busId (solo gpsType mobile). Máx puntos para polyline recorrido. */
const MOBILE_GPS_HISTORY_MAX = 300;
const MOBILE_GPS_MIN_MOVE_M = 15; // no duplicar si el celular no se movió
const mobileGpsHistory = new Map<string, Waypoint[]>();

function appendMobileGpsHistory(busId: string, lat: number, lng: number): void {
  const list = mobileGpsHistory.get(busId) ?? [];
  const last = list[list.length - 1];
  if (last) {
    const dM = haversineKm(last, { lat, lng }) * 1000;
    if (dM < MOBILE_GPS_MIN_MOVE_M) return;
  }
  list.push({ lat, lng });
  while (list.length > MOBILE_GPS_HISTORY_MAX) list.shift();
  mobileGpsHistory.set(busId, list);
}

/**
 * Actualiza posición real desde el celular. busId debe coincidir con el id del micro creado.
 * Solo aplica si el micro existe y tiene gpsType === "mobile".
 */
export function applyMobileGpsUpdate(
  busId: string,
  lat: number,
  lng: number,
  options?: { speedKmh?: number; timestamp?: number }
): { ok: boolean; error?: string } {
  ensureBusesInitialized();
  const bus = buses.get(busId);
  if (!bus) return { ok: false, error: "Bus no encontrado" };
  if (bus.gpsType !== "mobile") {
    return { ok: false, error: "Este micro no usa GPS del celular" };
  }
  bus.lat = lat;
  bus.lng = lng;
  bus.updatedAt = now();
  if (
    options?.speedKmh != null &&
    Number.isFinite(options.speedKmh) &&
    options.speedKmh >= 0
  ) {
    bus.speedKmh = Math.min(130, Math.max(0, options.speedKmh));
  }
  appendMobileGpsHistory(busId, lat, lng);
  return { ok: true };
}

/** Waypoints para mapa: historial real o vacío (nunca demo si hay GPS móvil activo). */
export function getMobileGpsWaypoints(busId: string): Waypoint[] {
  return mobileGpsHistory.get(busId) ?? [];
}

function tick(): void {
  const t = now();
  for (const bus of buses.values()) {
    // GPS móvil: no simular; la posición la envía /api/gps/update
    if (bus.gpsType === "mobile") continue;

    const route = getRouteById(bus.routeId);
    if (!route?.waypoints.length) continue;

    const len = route.waypoints.length;
    bus.routeIdx = (bus.routeIdx + 1) % len;
    const wp = route.waypoints[bus.routeIdx];
    // Marcador y lógica de mapa: siempre sobre la polyline (mismo array que routeWaypoints)
    bus.lat = wp.lat;
    bus.lng = wp.lng;
    bus.speedKmh = randomSpeed(bus.speedKmh);
    bus.updatedAt = t;
  }

  // Detección de desvío: si el micro está a más de 500 m de la ruta (omitir GPS móvil)
  for (const bus of buses.values()) {
    if (bus.gpsType === "mobile") continue;
    const route = getRouteById(bus.routeId);
    if (!route?.waypoints.length) continue;

    if (bus.lat == null || bus.lng == null) continue;
    const distM = distancePointToRouteM(
      { lat: bus.lat, lng: bus.lng },
      route.waypoints
    );
    const wasDesvio = desvioActive.get(bus.id) ?? false;

    if (distM > DESVIO_THRESHOLD_M) {
      if (!wasDesvio) {
        desvioActive.set(bus.id, true);
        if (!bus.activeIncidentId) bus.status = "DELAY";
        pushEvent(
          bus.id,
          "DESVIO",
          "Desvío detectado: el micro se alejó de la ruta programada."
        );
      }
    } else {
      if (wasDesvio) {
        desvioActive.set(bus.id, false);
        if (!bus.activeIncidentId) bus.status = "NORMAL";
        pushEvent(bus.id, "DESVIO_RESUELTO", "El micro retomó la ruta normal.");
      }
    }
  }
}

function maybeTick(): void {
  if (now() - lastTickAt >= TICK_MS) {
    tick();
    lastTickAt = now();
  }
}

function ensureBusesInitialized(): void {
  if (buses.size > 0) return;

  const rBaMdp = getRouteById("route-ba-mdp")!;
  const rBaRosario = getRouteById("route-ba-rosario")!;
  const rBaCordoba = getRouteById("route-ba-cordoba")!;

  const initialBuses: BusState[] = [
    // FlechaBus (comp-flecha) — 3 micros
    {
      id: "bus-f1",
      unitId: "FLE-101",
      plate: "AA123AA",
      routeName: rBaMdp.name,
      companySlug: "flechabus",
      companyId: "comp-flecha",
      company: "FlechaBus",
      tripId: "trip-f1",
      ticketCode: "ABC123",
      routeId: rBaMdp.id,
      lat: rBaMdp.waypoints[0].lat,
      lng: rBaMdp.waypoints[0].lng,
      routeIdx: 0,
      speedKmh: 90,
      status: "NORMAL",
      updatedAt: now(),
    },
    {
      id: "bus-f2",
      unitId: "FLE-102",
      plate: "AA124AA",
      routeName: rBaRosario.name,
      companySlug: "flechabus",
      companyId: "comp-flecha",
      company: "FlechaBus",
      tripId: "trip-f2",
      ticketCode: "ANA002",
      routeId: rBaRosario.id,
      lat: rBaRosario.waypoints[0].lat,
      lng: rBaRosario.waypoints[0].lng,
      routeIdx: 0,
      speedKmh: 88,
      status: "NORMAL",
      updatedAt: now(),
    },
    {
      id: "bus-f3",
      unitId: "FLE-103",
      plate: "AA125AA",
      routeName: rBaCordoba.name,
      companySlug: "flechabus",
      companyId: "comp-flecha",
      company: "FlechaBus",
      tripId: "trip-f3",
      ticketCode: "FLE003",
      routeId: rBaCordoba.id,
      lat: rBaCordoba.waypoints[0].lat,
      lng: rBaCordoba.waypoints[0].lng,
      routeIdx: 0,
      speedKmh: 92,
      status: "NORMAL",
      updatedAt: now(),
    },
    // Plusmar (comp-plusmar) — 3 micros
    {
      id: "bus-p1",
      unitId: "PLU-201",
      plate: "BB201BB",
      routeName: rBaMdp.name,
      companySlug: "plusmar",
      companyId: "comp-plusmar",
      company: "Plusmar",
      tripId: "trip-p1",
      ticketCode: "DEF456",
      routeId: rBaMdp.id,
      lat: rBaMdp.waypoints[0].lat,
      lng: rBaMdp.waypoints[0].lng,
      routeIdx: 5,
      speedKmh: 88,
      status: "NORMAL",
      updatedAt: now(),
    },
    {
      id: "bus-p2",
      unitId: "PLU-202",
      plate: "BB202BB",
      routeName: rBaRosario.name,
      companySlug: "plusmar",
      companyId: "comp-plusmar",
      company: "Plusmar",
      tripId: "trip-p2",
      ticketCode: "LUIS002",
      routeId: rBaRosario.id,
      lat: rBaRosario.waypoints[0].lat,
      lng: rBaRosario.waypoints[0].lng,
      routeIdx: 0,
      speedKmh: 90,
      status: "NORMAL",
      updatedAt: now(),
    },
    {
      id: "bus-p3",
      unitId: "PLU-203",
      plate: "BB203BB",
      routeName: rBaCordoba.name,
      companySlug: "plusmar",
      companyId: "comp-plusmar",
      company: "Plusmar",
      tripId: "trip-p3",
      ticketCode: "PLU003",
      routeId: rBaCordoba.id,
      lat: rBaCordoba.waypoints[0].lat,
      lng: rBaCordoba.waypoints[0].lng,
      routeIdx: 0,
      speedKmh: 87,
      status: "NORMAL",
      updatedAt: now(),
    },
  ];

  initialBuses.forEach((b) => buses.set(b.id, b));

  // Micros custom persistidos (misma empresa solo ve los suyos vía companyId)
  try {
    const { loadCustomBuses } =
      require("@/lib/demoBusesPersistence") as typeof import("@/lib/demoBusesPersistence");
    const extras = loadCustomBuses();
    for (const p of extras) {
      if (buses.has(p.id)) continue;
      const routeNameMobile =
        p.gpsType === "mobile" ? "GPS móvil (posición en vivo)" : p.routeName;
      const routeIdMobile =
        p.gpsType === "mobile" ? ROUTE_MOBILE_GPS_ID : p.routeId;
      const bus: BusState = {
        id: p.id,
        unitId: p.unitId,
        plate: p.plate,
        routeName: routeNameMobile,
        companySlug: p.companySlug,
        companyId: p.companyId,
        company: p.company as CompanyName,
        tripId: p.tripId,
        ticketCode: p.ticketCode,
        routeId: routeIdMobile,
        lat: p.lat,
        lng: p.lng,
        routeIdx: p.routeIdx,
        speedKmh: p.speedKmh,
        status: (p.status as BusStatus) || "NORMAL",
        updatedAt: p.updatedAt,
        driverName: p.driverName,
        gpsType: p.gpsType,
      };
      buses.set(bus.id, bus);
    }
  } catch {
    /* sin fs en edge */
  }
}

export type AddCustomBusInput = {
  unitId?: string;
  plate: string;
  driverName?: string;
  gpsType: "mobile" | "external";
};

/**
 * Crea un micro para la empresa indicada; persiste en demo-buses-extra.json.
 * Compatibilidad: los buses seed no se tocan; solo se agregan a la lista filtrada por companyId.
 */
export function addCustomBus(
  companyId: string,
  companySlug: string,
  companyDisplayName: string,
  input: AddCustomBusInput
): BusState {
  ensureBusesInitialized();
  const companyCount = Array.from(buses.values()).filter(
    (b) => b.companyId === companyId
  ).length;
  const unitId =
    input.unitId?.trim() ||
    `Micro ${companyCount + 1}`;
  const plate = input.plate.trim().toUpperCase();
  if (!plate) {
    throw new Error("La patente es obligatoria");
  }
  const useMobileGps = input.gpsType === "mobile";
  const routeMobile = getRouteById(ROUTE_MOBILE_GPS_ID);
  const routeExternal = getRouteById("route-ba-mdp");
  if (!useMobileGps && (!routeExternal || !routeExternal.waypoints[0])) {
    throw new Error("Ruta demo no disponible");
  }
  const route = useMobileGps
    ? routeMobile!
    : routeExternal!;
  const id = `bus-custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ticketCode = `CUST${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const bus: BusState = {
    id,
    unitId,
    plate,
    routeName: route.name,
    companySlug,
    companyId,
    company: companyDisplayName as CompanyName,
    tripId: `trip-${id}`,
    ticketCode,
    routeId: route.id,
    lat: useMobileGps ? null : routeExternal!.waypoints[0].lat,
    lng: useMobileGps ? null : routeExternal!.waypoints[0].lng,
    routeIdx: 0,
    speedKmh: 70,
    status: "NORMAL",
    updatedAt: now(),
    driverName: input.driverName?.trim() || undefined,
    gpsType: input.gpsType,
  };
  buses.set(bus.id, bus);
  try {
    const { appendCustomBus } =
      require("@/lib/demoBusesPersistence") as typeof import("@/lib/demoBusesPersistence");
    appendCustomBus({
      id: bus.id,
      unitId: bus.unitId,
      plate: bus.plate,
      routeName: bus.routeName,
      companySlug: bus.companySlug,
      companyId: bus.companyId,
      company: bus.company,
      tripId: bus.tripId,
      ticketCode: bus.ticketCode,
      routeId: bus.routeId,
      lat: bus.lat,
      lng: bus.lng,
      routeIdx: bus.routeIdx,
      speedKmh: bus.speedKmh,
      status: bus.status,
      updatedAt: bus.updatedAt,
      driverName: bus.driverName,
      gpsType: bus.gpsType,
    });
  } catch {
    /* ignore */
  }
  return bus;
}

/**
 * Reemplaza los waypoints de una ruta por la geometría de carretera (OSRM).
 * Remapea routeIdx de cada bus en esa ruta para mantener progreso proporcional.
 * Así el tick avanza sobre la misma polyline que ve el pasajero.
 */
export function applyRoadRoute(routeId: string, roadWaypoints: Waypoint[]): void {
  ensureBusesInitialized();
  const route = getRouteById(routeId);
  if (!route || roadWaypoints.length < 2) return;

  const oldWaypoints = route.waypoints;
  const oldLen = oldWaypoints.length;
  const newLen = roadWaypoints.length;
  route.waypoints = roadWaypoints;

  for (const bus of buses.values()) {
    if (bus.routeId !== routeId) continue;
    if (bus.gpsType === "mobile") continue;
    if (oldLen <= 1) {
      bus.routeIdx = 0;
    } else {
      const ratio = bus.routeIdx / (oldLen - 1);
      bus.routeIdx = Math.min(
        newLen - 1,
        Math.round(ratio * (newLen - 1))
      );
    }
    const wp = roadWaypoints[bus.routeIdx];
    bus.lat = wp.lat;
    bus.lng = wp.lng;
  }
  roadHydratedRouteIds.add(routeId);
}

/**
 * Hidrata con OSRM todas las rutas de los buses de la empresa.
 * Misma caché y applyRoadRoute que /api/public/trip → mapa empresa = mapa pasajero.
 */
export async function hydrateRoadRoutesForCompany(
  companyId: string
): Promise<void> {
  ensureBusesInitialized();
  const routeIds = new Set<string>();
  for (const bus of buses.values()) {
    if (bus.companyId === companyId) routeIds.add(bus.routeId);
  }
  for (const routeId of routeIds) {
    if (roadHydratedRouteIds.has(routeId)) continue;
    const route = getRouteById(routeId);
    if (!route || route.waypoints.length < 2) continue;
    const origin = route.waypoints[0];
    const dest = route.waypoints[route.waypoints.length - 1];
    try {
      const road = await getOrFetchRoadRoute(origin, dest);
      applyRoadRoute(routeId, road);
    } catch {
      // Fallback silencioso: se mantienen waypoints lineales
    }
  }
}

/** Aplica geometría OSRM por busId (misma ruta que el trip). */
export function applyRoadRouteForBus(
  busId: string,
  roadWaypoints: Waypoint[]
): void {
  ensureBusesInitialized();
  const bus = buses.get(busId);
  if (!bus) return;
  applyRoadRoute(bus.routeId, roadWaypoints);
}

/** @deprecated usar applyRoadRouteForBus; mantenido por compat */
export function applyRoadRouteForTicket(
  ticketCode: string,
  companySlug: string,
  roadWaypoints: Waypoint[]
): void {
  ensureBusesInitialized();
  const bus = Array.from(buses.values()).find(
    (b) =>
      b.ticketCode.toUpperCase() === ticketCode.toUpperCase() &&
      b.companySlug === companySlug
  );
  if (!bus) return;
  applyRoadRoute(bus.routeId, roadWaypoints);
}

function effectiveStatus(bus: BusState): BusStatus {
  if (!bus.activeIncidentId) return bus.status;
  const inc = incidents.find(
    (i) => i.id === bus.activeIncidentId && !i.resolvedAt
  );
  if (!inc) return bus.status;
  return inc.severity === "high" ? "INCIDENT" : "DELAY";
}

function pushEvent(busId: string, type: string, message: string): void {
  const bus = buses.get(busId);
  if (!bus) return;
  events.push({
    id: `ev-${events.length + 1}-${Date.now()}`,
    tripId: bus.tripId,
    busId,
    type,
    message,
    createdAt: now(),
  });
}

export function getAllBuses(companyId?: string): Array<{
  id: string;
  unitId: string;
  plate: string;
  routeName: string;
  companyId: string;
  companySlug: string;
  company: CompanyName;
  status: BusStatus;
  speedKmh: number;
  updatedAt: number;
  lat: number | null;
  lng: number | null;
  position: { lat: number; lng: number } | null;
  gpsPending?: boolean;
  activeIncident: Incident | null;
  routeWaypoints: Waypoint[];
  currentWaypointIndex: number;
  etaMinutes: number;
  driverName?: string;
  gpsType?: "mobile" | "external";
}> {
  ensureBusesInitialized();
  maybeTick();

  let list = Array.from(buses.values());
  if (companyId) list = list.filter((b) => b.companyId === companyId);

  return list.map((bus) => {
    const activeIncident = bus.activeIncidentId
      ? incidents.find(
          (i) => i.id === bus.activeIncidentId && !i.resolvedAt
        ) ?? null
      : null;

    // GPS móvil: solo posición e historial real; nunca waypoints demo
    let waypoints: Waypoint[];
    let idx: number;
    let etaMinutes: number;
    if (bus.gpsType === "mobile") {
      waypoints = getMobileGpsWaypoints(bus.id);
      idx =
        waypoints.length > 0
          ? waypoints.length - 1
          : 0;
      etaMinutes = 0;
    } else {
      const route = getRouteById(bus.routeId);
      waypoints = route?.waypoints ?? [];
      idx = Math.min(
        bus.routeIdx,
        Math.max(0, waypoints.length - 1)
      );
      const currentPos: Waypoint =
        waypoints.length > 0
          ? waypoints[idx]
          : {
              lat: bus.lat ?? 0,
              lng: bus.lng ?? 0,
            };
      const remainingKm =
        waypoints.length > 1
          ? remainingDistanceKm(currentPos, waypoints, idx)
          : 0;
      const speedKmh = Math.max(1, bus.speedKmh);
      etaMinutes =
        waypoints.length > 1
          ? Math.max(0, Math.round((remainingKm / speedKmh) * 60))
          : 0;
    }

    const hasPosition =
      bus.lat != null &&
      bus.lng != null &&
      Number.isFinite(bus.lat) &&
      Number.isFinite(bus.lng);
    const gpsPending =
      bus.gpsType === "mobile" && !hasPosition;

    return {
      id: bus.id,
      unitId: bus.unitId,
      plate: bus.plate,
      routeName: bus.routeName,
      companyId: bus.companyId,
      companySlug: bus.companySlug,
      company: bus.company,
      status: activeIncident
        ? activeIncident.severity === "high"
          ? "INCIDENT"
          : "DELAY"
        : bus.status,
      speedKmh: bus.speedKmh,
      updatedAt: bus.updatedAt,
      lat: hasPosition ? bus.lat : null,
      lng: hasPosition ? bus.lng : null,
      position: hasPosition
        ? { lat: bus.lat!, lng: bus.lng! }
        : null,
      gpsPending: gpsPending || undefined,
      activeIncident: activeIncident ?? null,
      routeWaypoints: waypoints,
      currentWaypointIndex:
        bus.gpsType === "mobile" && waypoints.length > 0
          ? waypoints.length - 1
          : idx,
      etaMinutes,
      driverName: bus.driverName,
      gpsType: bus.gpsType,
    };
  });
}

export function getBusById(id: string): BusState | undefined {
  ensureBusesInitialized();
  maybeTick();
  return buses.get(id);
}

export function getTripByTicketAndCompany(
  ticketCode: string,
  company: string
): {
  tripId: string;
  ticketCode: string;
  company: string;
  companySlug: string;
  routeWaypoints: Waypoint[];
  currentWaypointIndex: number;
  progressPercent: number;
  bus: {
    id: string;
    unitId: string;
    plate: string;
    routeName: string;
    company: string;
    status: BusStatus;
    speedKmh: number;
    updatedAt: number;
    position: Waypoint;
    waypoints: Waypoint[];
  };
  state: BusStatus;
  etaMinutes: number;
  lastUpdate: number;
  incident: Incident | null;
} | null {
  ensureBusesInitialized();
  maybeTick();

  const bus = Array.from(buses.values()).find(
    (b) =>
      b.ticketCode.toUpperCase() === ticketCode.toUpperCase() &&
      (b.companySlug === company || b.company === company)
  );
  if (!bus) return null;

  const hasGpsFix =
    bus.lat != null &&
    bus.lng != null &&
    Number.isFinite(bus.lat) &&
    Number.isFinite(bus.lng);
  if (bus.gpsType === "mobile" && !hasGpsFix) {
    // Sin fix aún: no exponer trip con posición ficticia
    return null;
  }

  let waypoints: Waypoint[];
  if (bus.gpsType === "mobile") {
    waypoints = getMobileGpsWaypoints(bus.id);
  } else {
    const route = getRouteById(bus.routeId);
    waypoints = route?.waypoints ?? [];
  }
  const activeIncident = bus.activeIncidentId
    ? incidents.find(
        (i) => i.id === bus.activeIncidentId && !i.resolvedAt
      ) ?? null
    : null;
  const state: BusStatus = activeIncident
    ? activeIncident.severity === "high"
      ? "INCIDENT"
      : "DELAY"
    : bus.status;

  // Posición: GPS móvil = bus.lat/lng actual (ya validados arriba); demo = polyline o fallback
  const idx =
    bus.gpsType === "mobile"
      ? Math.max(0, waypoints.length - 1)
      : Math.min(bus.routeIdx, Math.max(0, waypoints.length - 1));
  const currentPos: Waypoint =
    bus.gpsType === "mobile"
      ? waypointFromBusOrFallback(bus)
      : waypoints.length > 0
        ? waypoints[idx]
        : waypointFromBusOrFallback(bus);
  const remainingKm =
    waypoints.length > 1 && bus.gpsType !== "mobile"
      ? remainingDistanceKm(currentPos, waypoints, idx)
      : 0;
  const speedKmh = Math.max(1, bus.speedKmh);
  const etaMinutes =
    bus.gpsType === "mobile"
      ? 0
      : Math.round((remainingKm / speedKmh) * 60);

  const progressPercent =
    bus.gpsType === "mobile"
      ? waypoints.length <= 1
        ? 0
        : 50
      : waypoints.length <= 1
        ? 100
        : Math.min(100, Math.round((idx / (waypoints.length - 1)) * 100));

  return {
    tripId: bus.tripId,
    ticketCode: bus.ticketCode,
    company: bus.companySlug,
    companySlug: bus.companySlug,
    routeWaypoints: waypoints,
    currentWaypointIndex: idx,
    progressPercent,
    bus: {
      id: bus.id,
      unitId: bus.unitId,
      plate: bus.plate,
      routeName: bus.routeName,
      company: bus.companySlug,
      status: state,
      speedKmh: bus.speedKmh,
      updatedAt: bus.updatedAt,
      position: waypointFromBusOrFallback(bus),
      waypoints,
    },
    state,
    etaMinutes: Math.max(0, etaMinutes),
    lastUpdate: bus.updatedAt,
    incident: activeIncident ?? null,
  };
}

export function getEventsForTrip(tripId: string, limit = 10): EventLog[] {
  return events
    .filter((e) => e.tripId === tripId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export function createIncident(params: {
  busId: string;
  type: string;
  severity: IncidentSeverity;
  description: string;
  etaMinutes: number;
}): Incident {
  ensureBusesInitialized();
  const bus = buses.get(params.busId);
  if (!bus) throw new Error("Bus no encontrado");

  const incident: Incident = {
    id: `inc-${incidents.length + 1}-${Date.now()}`,
    busId: bus.id,
    type: params.type,
    severity: params.severity,
    description: params.description,
    etaMinutes: params.etaMinutes,
    createdAt: now(),
  };
  incidents.push(incident);
  bus.activeIncidentId = incident.id;
  bus.status = params.severity === "high" ? "INCIDENT" : "DELAY";

  pushEvent(
    bus.id,
    "INCIDENT_CREATED",
    `Incidente creado: ${params.type} (${params.severity})`
  );
  return incident;
}

export function getIncidentById(incidentId: string): Incident | undefined {
  return incidents.find((i) => i.id === incidentId);
}

export function resolveIncident(incidentId: string): Incident {
  const incident = incidents.find((i) => i.id === incidentId);
  if (!incident || incident.resolvedAt) {
    throw new Error("Incidente no encontrado");
  }
  incident.resolvedAt = now();

  const bus = buses.get(incident.busId);
  if (bus && bus.activeIncidentId === incident.id) {
    bus.activeIncidentId = undefined;
    bus.status = "NORMAL";
  }

  pushEvent(incident.busId, "INCIDENT_RESOLVED", `Incidente resuelto: ${incident.type}`);
  return incident;
}
