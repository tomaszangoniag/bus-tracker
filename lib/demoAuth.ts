/**
 * Auth DEMO en memoria + sesiones en memoria.
 * Contraseñas en claro "demo" (mock; no usar en producción).
 */

export interface Company {
  id: string;
  name: string;
  slug: string;
}

export type UserRole = "passenger" | "company";

export interface User {
  id: string;
  name: string;
  email: string;
  /** Mock: en producción sería hash */
  passwordMock: string;
  role: UserRole;
  companyId?: string;
}

export interface Session {
  token: string;
  userId: string;
  createdAt: number;
}

/** Ticket asociado a un pasajero (acceso a un bus/viaje) */
export interface PassengerTicket {
  id: string;
  passengerUserId: string;
  busId: string;
  ticketCode: string;
  /** Slug de empresa para UI y query trip */
  companySlug: string;
  tripId: string;
}

const companies: Company[] = [
  { id: "comp-flecha", name: "FlechaBus", slug: "flechabus" },
  { id: "comp-plusmar", name: "Plusmar", slug: "plusmar" },
];

const users: User[] = [
  {
    id: "user-p1",
    name: "Ana Pasajera",
    email: "ana@demo.com",
    passwordMock: "demo",
    role: "passenger",
  },
  {
    id: "user-p2",
    name: "Luis Pasajero",
    email: "luis@demo.com",
    passwordMock: "demo",
    role: "passenger",
  },
  {
    id: "user-c1",
    name: "Admin FlechaBus",
    email: "admin@flechabus.demo",
    passwordMock: "demo",
    role: "company",
    companyId: "comp-flecha",
  },
  {
    id: "user-c2",
    name: "Admin Plusmar",
    email: "admin@plusmar.demo",
    passwordMock: "demo",
    role: "company",
    companyId: "comp-plusmar",
  },
];

const passengerTickets: PassengerTicket[] = [
  {
    id: "pt-1",
    passengerUserId: "user-p1",
    busId: "bus-f1",
    ticketCode: "ABC123",
    companySlug: "flechabus",
    tripId: "trip-f1",
  },
  {
    id: "pt-2",
    passengerUserId: "user-p1",
    busId: "bus-f2",
    ticketCode: "ANA002",
    companySlug: "flechabus",
    tripId: "trip-f2",
  },
  {
    id: "pt-3",
    passengerUserId: "user-p2",
    busId: "bus-p1",
    ticketCode: "DEF456",
    companySlug: "plusmar",
    tripId: "trip-p1",
  },
  {
    id: "pt-4",
    passengerUserId: "user-p2",
    busId: "bus-p2",
    ticketCode: "LUIS002",
    companySlug: "plusmar",
    tripId: "trip-p2",
  },
];

// Hidratar desde disco después del seed (no pisa cuentas demo)
try {
  const { hydrateFromDisk } =
    require("@/lib/demoAuthPersistence") as typeof import("@/lib/demoAuthPersistence");
  hydrateFromDisk(companies, users);
} catch {
  /* sin fs en edge */
}

const sessions = new Map<string, Session>();

function randomToken(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function getCompanyById(id: string): Company | undefined {
  return companies.find((c) => c.id === id);
}

export function getCompanyBySlug(slug: string): Company | undefined {
  return companies.find((c) => c.slug === slug);
}

export function getUserByEmail(email: string): User | undefined {
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function getUserById(id: string): User | undefined {
  return users.find((u) => u.id === id);
}

export function createUser(params: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  companyId?: string;
}): User {
  if (getUserByEmail(params.email)) {
    throw new Error("El email ya está registrado");
  }
  const user: User = {
    id: `user-${Date.now()}`,
    name: params.name,
    email: params.email.toLowerCase(),
    passwordMock: params.password,
    role: params.role,
    companyId: params.companyId,
  };
  users.push(user);
  try {
    const { appendUserExtra } =
      require("@/lib/demoAuthPersistence") as typeof import("@/lib/demoAuthPersistence");
    appendUserExtra(user);
  } catch {
    /* ignore */
  }
  return user;
}

export function createCompany(name: string, slug: string): Company {
  const id = `comp-${slug.replace(/\s+/g, "-")}`;
  if (companies.some((c) => c.slug === slug)) {
    throw new Error("Slug de empresa ya existe");
  }
  const c: Company = { id, name, slug };
  companies.push(c);
  try {
    const { appendCompanyExtra } =
      require("@/lib/demoAuthPersistence") as typeof import("@/lib/demoAuthPersistence");
    appendCompanyExtra(c);
  } catch {
    /* ignore */
  }
  return c;
}

export function login(email: string, password: string): Session {
  const user = getUserByEmail(email);
  if (!user || user.passwordMock !== password) {
    throw new Error("Credenciales inválidas");
  }
  const token = randomToken();
  const session: Session = { token, userId: user.id, createdAt: Date.now() };
  sessions.set(token, session);
  return session;
}

export function logout(token: string): void {
  sessions.delete(token);
}

export function getSession(token: string | null): Session | null {
  if (!token) return null;
  return sessions.get(token) ?? null;
}

export function getSessionUser(token: string | null): User | null {
  const s = getSession(token);
  if (!s) return null;
  return getUserById(s.userId) ?? null;
}

export function getPassengerTickets(passengerUserId: string): PassengerTicket[] {
  return passengerTickets.filter((t) => t.passengerUserId === passengerUserId);
}

export function getPassengerTicket(
  passengerUserId: string,
  ticketCode: string
): PassengerTicket | undefined {
  return passengerTickets.find(
    (t) =>
      t.passengerUserId === passengerUserId &&
      t.ticketCode.toUpperCase() === ticketCode.toUpperCase()
  );
}

/** Registra un ticket para un pasajero (demo) */
export function addPassengerTicket(t: Omit<PassengerTicket, "id">): PassengerTicket {
  const pt: PassengerTicket = {
    ...t,
    id: `pt-${Date.now()}`,
  };
  passengerTickets.push(pt);
  return pt;
}

export function listCompanies(): Company[] {
  return [...companies];
}
