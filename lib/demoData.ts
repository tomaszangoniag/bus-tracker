export type BusStatus = "NORMAL" | "DELAY" | "INCIDENT";

export type CompanyName = "FlechaBus" | "Plusmar" | "RutaAtlantica";

export interface Waypoint {
  lat: number;
  lng: number;
}

export interface Bus {
  id: string;
  unitId: string;
  plate: string;
  routeName: string;
  company: CompanyName;
  status: BusStatus;
  speedKmh: number;
  updatedAt: number;
  waypoints: Waypoint[];
  currentWaypointIndex: number;
  activeIncidentId?: string;
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

export interface Ticket {
  code: string;
  busId: string;
  company: CompanyName;
  tripId: string;
}

const now = () => Date.now();

// Coordenadas aproximadas de ciudades principales
const CITY = {
  BUENOS_AIRES: { lat: -34.6037, lng: -58.3816 },
  MAR_DEL_PLATA: { lat: -38.0055, lng: -57.5426 },
  ROSARIO: { lat: -32.9442, lng: -60.6505 },
  CORDOBA: { lat: -31.4201, lng: -64.1888 },
  MENDOZA: { lat: -32.8895, lng: -68.8458 },
  TUCUMAN: { lat: -26.8083, lng: -65.2176 },
  SANTA_ROSA: { lat: -36.6203, lng: -64.2906 },
  BAHIA_BLANCA: { lat: -38.7183, lng: -62.2663 },
  NEUQUEN: { lat: -38.9516, lng: -68.0591 },
  BARILOCHE: { lat: -41.1335, lng: -71.3103 },
};

function buildRoute(from: Waypoint, to: Waypoint, steps: number): Waypoint[] {
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

// DEMO buses
const buses: Bus[] = [
  {
    id: "bus-1",
    unitId: "FLE-101",
    plate: "AA123AA",
    routeName: "Buenos Aires – Mar del Plata",
    company: "FlechaBus",
    status: "NORMAL",
    speedKmh: 90,
    updatedAt: now(),
    waypoints: buildRoute(CITY.BUENOS_AIRES, CITY.MAR_DEL_PLATA, 20),
    currentWaypointIndex: 5,
  },
  {
    id: "bus-2",
    unitId: "PLU-202",
    plate: "AB456BC",
    routeName: "Buenos Aires – Rosario",
    company: "Plusmar",
    status: "NORMAL",
    speedKmh: 88,
    updatedAt: now(),
    waypoints: buildRoute(CITY.BUENOS_AIRES, CITY.ROSARIO, 18),
    currentWaypointIndex: 7,
  },
  {
    id: "bus-3",
    unitId: "RUT-303",
    plate: "AC789CD",
    routeName: "Buenos Aires – Córdoba",
    company: "RutaAtlantica",
    status: "NORMAL",
    speedKmh: 92,
    updatedAt: now(),
    waypoints: buildRoute(CITY.BUENOS_AIRES, CITY.CORDOBA, 22),
    currentWaypointIndex: 4,
  },
  {
    id: "bus-4",
    unitId: "FLE-104",
    plate: "AD111EF",
    routeName: "Buenos Aires – Mendoza",
    company: "FlechaBus",
    status: "NORMAL",
    speedKmh: 95,
    updatedAt: now(),
    waypoints: buildRoute(CITY.BUENOS_AIRES, CITY.MENDOZA, 25),
    currentWaypointIndex: 10,
  },
  {
    id: "bus-5",
    unitId: "PLU-205",
    plate: "AE222FG",
    routeName: "Buenos Aires – Tucumán",
    company: "Plusmar",
    status: "NORMAL",
    speedKmh: 87,
    updatedAt: now(),
    waypoints: buildRoute(CITY.BUENOS_AIRES, CITY.TUCUMAN, 28),
    currentWaypointIndex: 8,
  },
  {
    id: "bus-6",
    unitId: "RUT-306",
    plate: "AF333GH",
    routeName: "Buenos Aires – Santa Rosa",
    company: "RutaAtlantica",
    status: "NORMAL",
    speedKmh: 85,
    updatedAt: now(),
    waypoints: buildRoute(CITY.BUENOS_AIRES, CITY.SANTA_ROSA, 16),
    currentWaypointIndex: 6,
  },
  {
    id: "bus-7",
    unitId: "FLE-107",
    plate: "AG444HI",
    routeName: "Buenos Aires – Bahía Blanca",
    company: "FlechaBus",
    status: "NORMAL",
    speedKmh: 93,
    updatedAt: now(),
    waypoints: buildRoute(CITY.BUENOS_AIRES, CITY.BAHIA_BLANCA, 21),
    currentWaypointIndex: 3,
  },
  {
    id: "bus-8",
    unitId: "PLU-208",
    plate: "AH555JK",
    routeName: "Buenos Aires – Neuquén",
    company: "Plusmar",
    status: "NORMAL",
    speedKmh: 89,
    updatedAt: now(),
    waypoints: buildRoute(CITY.BUENOS_AIRES, CITY.NEUQUEN, 24),
    currentWaypointIndex: 9,
  },
  {
    id: "bus-9",
    unitId: "RUT-309",
    plate: "AI666LM",
    routeName: "Buenos Aires – Bariloche",
    company: "RutaAtlantica",
    status: "NORMAL",
    speedKmh: 91,
    updatedAt: now(),
    waypoints: buildRoute(CITY.BUENOS_AIRES, CITY.BARILOCHE, 30),
    currentWaypointIndex: 12,
  },
  {
    id: "bus-10",
    unitId: "FLE-110",
    plate: "AJ777NO",
    routeName: "Mar del Plata – Bahía Blanca",
    company: "FlechaBus",
    status: "NORMAL",
    speedKmh: 86,
    updatedAt: now(),
    waypoints: buildRoute(CITY.MAR_DEL_PLATA, CITY.BAHIA_BLANCA, 18),
    currentWaypointIndex: 2,
  },
];

const tickets: Ticket[] = [
  {
    code: "ABC123",
    busId: "bus-1",
    company: "FlechaBus",
    tripId: "trip-1",
  },
  {
    code: "DEF456",
    busId: "bus-2",
    company: "Plusmar",
    tripId: "trip-2",
  },
];

let incidents: Incident[] = [];
let events: EventLog[] = [];

function getBusById(busId: string): Bus | undefined {
  return buses.find((b) => b.id === busId);
}

function randomSpeed(base: number): number {
  const delta = (Math.random() - 0.5) * 10;
  return Math.max(60, Math.min(110, base + delta));
}

function advanceBusPosition(bus: Bus) {
  if (!bus.waypoints.length) return;
  bus.currentWaypointIndex =
    (bus.currentWaypointIndex + 1) % bus.waypoints.length;
  bus.speedKmh = randomSpeed(bus.speedKmh);
  bus.updatedAt = now();
}

export function getBusPosition(bus: Bus): Waypoint {
  if (!bus.waypoints.length) {
    return CITY.BUENOS_AIRES;
  }
  return (
    bus.waypoints[bus.currentWaypointIndex] ?? bus.waypoints[0]
  );
}

export function getTickets() {
  return tickets;
}

export function getDashboardData() {
  buses.forEach(advanceBusPosition);

  return buses.map((bus) => {
    const position = getBusPosition(bus);
    const activeIncident = incidents.find(
      (inc) => inc.id === bus.activeIncidentId && !inc.resolvedAt
    );

    let state: BusStatus = bus.status;
    if (activeIncident) {
      state =
        activeIncident.severity === "high"
          ? "INCIDENT"
          : "DELAY";
    }

    return {
      id: bus.id,
      unitId: bus.unitId,
      plate: bus.plate,
      routeName: bus.routeName,
      company: bus.company,
      status: state,
      speedKmh: bus.speedKmh,
      updatedAt: bus.updatedAt,
      activeIncident,
      position,
    };
  });
}

export function getTripByTicketAndCompany(ticketCode: string, company: string) {
  const ticket = tickets.find(
    (t) => t.code === ticketCode && t.company === company
  );
  if (!ticket) return null;

  const bus = getBusById(ticket.busId);
  if (!bus) return null;

  advanceBusPosition(bus);
  const position = getBusPosition(bus);

  const activeIncident = incidents.find(
    (inc) => inc.id === bus.activeIncidentId && !inc.resolvedAt
  );

  let state: BusStatus = bus.status;
  if (activeIncident) {
    state =
      activeIncident.severity === "high"
        ? "INCIDENT"
        : "DELAY";
  }

  // ETA demo: distancia normalizada por cantidad de waypoints restantes
  const remaining =
    bus.waypoints.length - bus.currentWaypointIndex;
  const etaMinutes = Math.max(5, remaining * 3);

  return {
    tripId: ticket.tripId,
    ticketCode: ticket.code,
    company: ticket.company,
    bus: {
      id: bus.id,
      unitId: bus.unitId,
      plate: bus.plate,
      routeName: bus.routeName,
      company: bus.company,
      status: state,
      speedKmh: bus.speedKmh,
      updatedAt: bus.updatedAt,
      position,
      waypoints: bus.waypoints,
    },
    state,
    etaMinutes,
    lastUpdate: bus.updatedAt,
    incident: activeIncident ?? null,
  };
}

export function getEventsForTrip(
  tripId: string,
  limit = 10
): EventLog[] {
  return events
    .filter((e) => e.tripId === tripId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

function pushEventForBus(
  busId: string,
  type: string,
  message: string
) {
  const ticket = tickets.find((t) => t.busId === busId);
  if (!ticket) return;

  const event: EventLog = {
    id: `ev-${events.length + 1}-${Date.now()}`,
    tripId: ticket.tripId,
    busId,
    type,
    message,
    createdAt: now(),
  };
  events.push(event);
}

export function createIncident(params: {
  busId: string;
  type: string;
  severity: IncidentSeverity;
  description: string;
  etaMinutes: number;
}) {
  const bus = getBusById(params.busId);
  if (!bus) {
    throw new Error("Bus no encontrado");
  }

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
  bus.status =
    params.severity === "high" ? "INCIDENT" : "DELAY";

  pushEventForBus(
    bus.id,
    "INCIDENT_CREATED",
    `Incidente creado: ${params.type} (${params.severity})`
  );

  return incident;
}

export function resolveIncident(incidentId: string) {
  const incident = incidents.find(
    (inc) => inc.id === incidentId
  );
  if (!incident || incident.resolvedAt) {
    throw new Error("Incidente no encontrado");
  }

  incident.resolvedAt = now();

  const bus = getBusById(incident.busId);
  if (bus && bus.activeIncidentId === incident.id) {
    bus.activeIncidentId = undefined;
    bus.status = "NORMAL";
  }

  pushEventForBus(
    incident.busId,
    "INCIDENT_RESOLVED",
    `Incidente resuelto: ${incident.type}`
  );

  return incident;
}

export function getIncidentsForBus(busId: string) {
  return incidents.filter((i) => i.busId === busId);
}

