'use client';

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { clearDemoSession } from "@/lib/authClient";

const BusMap = dynamic(() => import("@/components/BusMap"), { ssr: false });
const MobileGpsConnect = dynamic(
  () => import("@/components/MobileGpsConnect"),
  { ssr: false }
);

type BusStatus = "NORMAL" | "DELAY" | "INCIDENT";

interface DashboardBus {
  id: string;
  unitId: string;
  plate: string;
  routeName: string;
  companyId?: string;
  companySlug?: string;
  company: string;
  status: BusStatus;
  speedKmh: number;
  updatedAt: number;
  /** Ubicación para mapa y tabla; null = GPS pendiente */
  position: { lat: number; lng: number } | null;
  gpsPending?: boolean;
  activeIncident: {
    id: string;
    type: string;
    severity: "low" | "medium" | "high";
    description: string;
    etaMinutes: number;
    createdAt: number;
    resolvedAt?: number;
  } | null;
  routeWaypoints: { lat: number; lng: number }[];
  currentWaypointIndex: number;
  etaMinutes: number;
  driverName?: string;
  gpsType?: "mobile" | "external";
  tripCode?: string;
  tripOrigin?: string;
  tripDestination?: string;
}

interface DashboardResponse {
  buses: DashboardBus[];
}

/** Normaliza ubicación solo desde position o desde lat/lng en JSON (sin tipar como DashboardBus). */
function normalizeDashboardPosition(raw: unknown): {
  lat: number;
  lng: number;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const pos = o.position;
  if (
    pos &&
    typeof pos === "object" &&
    typeof (pos as { lat?: unknown }).lat === "number" &&
    typeof (pos as { lng?: unknown }).lng === "number"
  ) {
    const lat = (pos as { lat: number }).lat;
    const lng = (pos as { lng: number }).lng;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  if (typeof o.lat === "number" && typeof o.lng === "number") {
    if (Number.isFinite(o.lat) && Number.isFinite(o.lng))
      return { lat: o.lat, lng: o.lng };
  }
  return null;
}

type StatusFilter = "ALL" | BusStatus;

interface IncidentFormState {
  busId: string | null;
  type: string;
  severity: "low" | "medium" | "high";
  description: string;
  etaMinutes: string;
  submitting: boolean;
  error: string | null;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Distancia en km entre dos puntos (Haversine). */
function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

/** Suma de tramos recorridos según índice actual sobre routeWaypoints (demo aproximado). */
function kmRecorridosAprox(bus: DashboardBus): string {
  const wps = bus.routeWaypoints;
  if (wps.length < 2) return "—";
  let km = 0;
  const idx = Math.min(
    Math.max(0, bus.currentWaypointIndex),
    wps.length - 1
  );
  for (let i = 0; i < idx; i++) {
    km += haversineKm(wps[i], wps[i + 1]);
  }
  return `${km.toFixed(1)} km (aprox.)`;
}

function statusLabel(status: BusStatus): string {
  if (status === "NORMAL") return "Normal";
  if (status === "DELAY") return "Demora";
  return "Incidente";
}

function gpsTypeLabel(bus: DashboardBus): string {
  if (bus.gpsType === "external") return "GPS externo";
  if (bus.gpsType === "mobile") return "GPS del celular";
  return "Simulación demo";
}

function statusBadgeClasses(status: BusStatus) {
  switch (status) {
    case "NORMAL":
      return "bg-emerald-50 text-emerald-700 ring-emerald-500/40";
    case "DELAY":
      return "bg-amber-50 text-amber-800 ring-amber-500/40";
    case "INCIDENT":
      return "bg-red-50 text-red-700 ring-red-500/40";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-400/40";
  }
}

export default function CompanyPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [isCompany, setIsCompany] = useState(false);

  const [dashboard, setDashboard] =
    useState<DashboardResponse | null>(null);
  const [loadingDash, setLoadingDash] = useState(false);
  const [dashError, setDashError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("ALL");
  const [routeFilter, setRouteFilter] = useState("");
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);

  const [addBusOpen, setAddBusOpen] = useState(false);
  const [addBusSubmitting, setAddBusSubmitting] = useState(false);
  const [addBusError, setAddBusError] = useState<string | null>(null);
  const [addBusSuccess, setAddBusSuccess] = useState<string | null>(null);
  const [addBusForm, setAddBusForm] = useState({
    unitId: "",
    plate: "",
    driverName: "",
    gpsType: "mobile" as "mobile" | "external",
  });

  const [deleteConfirmBusId, setDeleteConfirmBusId] = useState<string | null>(
    null
  );
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  interface CompanyTicketRow {
    id: string;
    ticketCode: string;
    busId: string;
    passengerName?: string;
    origin?: string;
    destination?: string;
    createdAt: number;
  }
  const [busTickets, setBusTickets] = useState<CompanyTicketRow[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    ticketCode: "",
    passengerName: "",
    origin: "",
    destination: "",
  });
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketSuccess, setTicketSuccess] = useState<string | null>(null);

  const [companyDisplayName, setCompanyDisplayName] = useState("");
  const [companyNameSaving, setCompanyNameSaving] = useState(false);
  const [tripMetaForm, setTripMetaForm] = useState({
    tripCode: "",
    tripOrigin: "",
    tripDestination: "",
  });
  const [tripMetaSaving, setTripMetaSaving] = useState(false);
  const [tripMetaMessage, setTripMetaMessage] = useState<string | null>(null);

  const [incidentForm, setIncidentForm] =
    useState<IncidentFormState>({
      busId: null,
      type: "Demora",
      severity: "medium",
      description: "",
      etaMinutes: "20",
      submitting: false,
      error: null,
    });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/auth/session");
      const data = await res.json();
      if (cancelled) return;
      if (!data.user) {
        router.replace("/login?next=/company");
        return;
      }
      // Pasajero no puede acceder al panel empresa → inicio
      if (data.user.role === "passenger") {
        router.replace("/");
        return;
      }
      if (data.user.role !== "company") {
        router.replace("/login");
        return;
      }
      setIsCompany(true);
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const loadDashboard = async (initial = false, bustCache = false) => {
    try {
      if (initial) {
        setLoadingDash(true);
        setDashError(null);
      }
      const url = bustCache
        ? `/api/company/dashboard?_=${Date.now()}`
        : "/api/company/dashboard";
      const res = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
        headers: bustCache ? { "Cache-Control": "no-cache" } : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Error al cargar dashboard");
      }
      const data = (await res.json()) as { buses: unknown[] };
      // Nueva referencia para forzar re-render (incidentes activos / resueltos)
      setDashboard({
        buses: data.buses.map((raw) => {
          const b = raw as DashboardBus;
          const position = normalizeDashboardPosition(raw) ?? b.position ?? null;
          return {
            ...b,
            driverName: b.driverName,
            gpsType: b.gpsType,
            activeIncident: b.activeIncident
              ? { ...b.activeIncident }
              : null,
            position,
            gpsPending:
              b.gpsPending ?? (position == null && b.gpsType === "mobile"),
            routeWaypoints: b.routeWaypoints ?? [],
            currentWaypointIndex: b.currentWaypointIndex ?? 0,
            etaMinutes: b.etaMinutes ?? 0,
          };
        }),
      });
    } catch (err) {
      console.error(err);
      setDashError(
        err instanceof Error
          ? err.message
          : "Error al cargar dashboard"
      );
    } finally {
      if (initial) setLoadingDash(false);
    }
  };

  useEffect(() => {
    if (!isCompany) return;
    let cancelled = false;

    const init = async () => {
      if (cancelled) return;
      await loadDashboard(true);
    };

    init();
    const id = setInterval(() => {
      if (!cancelled) {
        loadDashboard(false);
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isCompany]);

  const selectedBus = useMemo(() => {
    if (!dashboard || !selectedBusId) return null;
    return dashboard.buses.find((b) => b.id === selectedBusId) ?? null;
  }, [dashboard, selectedBusId]);

  const loadBusTickets = async (busId: string) => {
    setTicketsLoading(true);
    setTicketError(null);
    try {
      const res = await fetch(
        `/api/company/tickets?busId=${encodeURIComponent(busId)}`,
        { credentials: "same-origin" }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Error al cargar pasajes");
      setBusTickets(Array.isArray(data.tickets) ? data.tickets : []);
    } catch (e) {
      setBusTickets([]);
      setTicketError(
        e instanceof Error ? e.message : "Error al cargar pasajes"
      );
    } finally {
      setTicketsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedBusId) {
      setBusTickets([]);
      return;
    }
    void loadBusTickets(selectedBusId);
  }, [selectedBusId]);

  useEffect(() => {
    if (!isCompany) return;
    (async () => {
      const res = await fetch("/api/company/profile", { credentials: "same-origin" });
      if (res.ok) {
        const d = await res.json();
        if (d.name) setCompanyDisplayName(d.name);
      }
    })();
  }, [isCompany]);

  useEffect(() => {
    if (!selectedBus) return;
    setTripMetaForm({
      tripCode: selectedBus.tripCode ?? "",
      tripOrigin: selectedBus.tripOrigin ?? "",
      tripDestination: selectedBus.tripDestination ?? "",
    });
    setTripMetaMessage(null);
  }, [selectedBus?.id, selectedBus?.tripCode]);

  const filteredBuses = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.buses.filter((b) => {
      const statusOk =
        statusFilter === "ALL" || b.status === statusFilter;
      const routeOk = routeFilter
        ? b.routeName
            .toLowerCase()
            .includes(routeFilter.toLowerCase())
        : true;
      return statusOk && routeOk;
    });
  }, [dashboard, statusFilter, routeFilter]);

  const submitAddBus = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddBusError(null);
    setAddBusSuccess(null);
    if (!addBusForm.plate.trim()) {
      setAddBusError("La patente es obligatoria.");
      return;
    }
    setAddBusSubmitting(true);
    try {
      const res = await fetch("/api/company/buses", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: addBusForm.unitId.trim() || undefined,
          plate: addBusForm.plate.trim(),
          driverName: addBusForm.driverName.trim() || undefined,
          gpsType: addBusForm.gpsType,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Error al crear micro");
      }
      setAddBusSuccess(data?.message ?? "Micro agregado correctamente");
      setAddBusForm({
        unitId: "",
        plate: "",
        driverName: "",
        gpsType: "mobile",
      });
      await loadDashboard(false, true);
      // Cerrar modal tras breve delay para que se lea el mensaje
      setTimeout(() => {
        setAddBusOpen(false);
        setAddBusSuccess(null);
      }, 1800);
    } catch (err) {
      setAddBusError(
        err instanceof Error ? err.message : "Error al crear micro"
      );
    } finally {
      setAddBusSubmitting(false);
    }
  };

  const isCustomBus = (id: string) => id.startsWith("bus-custom-");

  const confirmDeleteBus = (busId: string) => {
    setDeleteConfirmBusId(busId);
    setDeleteSuccess(null);
  };

  const executeDeleteBus = async () => {
    if (!deleteConfirmBusId) return;
    setDeleteSubmitting(true);
    setDeleteSuccess(null);
    try {
      const res = await fetch(
        `/api/company/buses/${encodeURIComponent(deleteConfirmBusId)}`,
        { method: "DELETE", credentials: "same-origin" }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "No se pudo eliminar");
      }
      if (selectedBusId === deleteConfirmBusId) {
        setSelectedBusId(null);
      }
      setDeleteConfirmBusId(null);
      setDeleteSuccess(data?.message ?? "Micro eliminado correctamente");
      setDashError(null);
      await loadDashboard(false, true);
      setTimeout(() => setDeleteSuccess(null), 4000);
    } catch (e) {
      setDashError(
        e instanceof Error ? e.message : "Error al eliminar micro"
      );
      setDeleteConfirmBusId(null);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const openIncidentForm = (busId: string) => {
    setIncidentForm((prev) => ({
      ...prev,
      busId,
      description: "",
      etaMinutes: "20",
      submitting: false,
      error: null,
    }));
  };

  const submitIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incidentForm.busId) return;

    const eta = parseInt(incidentForm.etaMinutes, 10);
    if (Number.isNaN(eta) || eta < 0) {
      setIncidentForm((prev) => ({
        ...prev,
        error: "ETA debe ser un número mayor o igual a 0.",
      }));
      return;
    }

    try {
      setIncidentForm((prev) => ({
        ...prev,
        submitting: true,
        error: null,
      }));
      const res = await fetch("/api/company/incidents", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          busId: incidentForm.busId,
          type: incidentForm.type,
          severity: incidentForm.severity,
          description:
            incidentForm.description ||
            `Incidente ${incidentForm.type.toLowerCase()}`,
          etaMinutes: eta,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          payload?.error ?? "No se pudo crear el incidente."
        );
      }
      await loadDashboard(false, true);
      setIncidentForm((prev) => ({
        ...prev,
        busId: null,
        submitting: false,
        error: null,
      }));
    } catch (err) {
      console.error(err);
      setIncidentForm((prev) => ({
        ...prev,
        submitting: false,
        error:
          err instanceof Error
            ? err.message
            : "No se pudo crear el incidente.",
      }));
    }
  };

  const resolveIncident = async (incidentId: string) => {
    try {
      const res = await fetch(
        "/api/company/incidents/resolve",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ incidentId }),
        }
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          payload?.error ?? "No se pudo resolver el incidente."
        );
      }
      await loadDashboard(false, true);
      setDashError(null);
    } catch (err) {
      console.error(err);
      setDashError(
        err instanceof Error
          ? err.message
          : "No se pudo resolver el incidente."
      );
    }
  };

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    clearDemoSession();
    router.replace("/");
  }

  if (!authChecked || !isCompany) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Dashboard de flota
            </h1>
            <p className="text-sm text-slate-500">
              Visualizá el estado de los micros, creá incidentes y
              reflejalos en tiempo real para los pasajeros.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Volver al inicio
            </a>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        {/* Nombre visible de la empresa (pasajeros ven este nombre en sesión) */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Nombre de la empresa
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Es el nombre que verán los pasajeros asociado a tu empresa. El
            código de viaje de cada micro se busca junto con la empresa
            (FlechaBus / Plusmar según tu cuenta).
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <input
              type="text"
              value={companyDisplayName}
              onChange={(e) => setCompanyDisplayName(e.target.value)}
              className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Nombre comercial"
            />
            <button
              type="button"
              disabled={companyNameSaving || !companyDisplayName.trim()}
              onClick={async () => {
                setCompanyNameSaving(true);
                try {
                  const res = await fetch("/api/company/profile", {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: companyDisplayName.trim() }),
                  });
                  const d = await res.json().catch(() => null);
                  if (!res.ok) throw new Error(d?.error ?? "Error");
                  setDashError(null);
                } catch (e) {
                  setDashError(
                    e instanceof Error ? e.message : "Error al guardar"
                  );
                } finally {
                  setCompanyNameSaving(false);
                }
              }}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
            >
              {companyNameSaving ? "Guardando…" : "Guardar nombre"}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 font-medium">
                Estado:{" "}
                <span className="font-semibold text-slate-900">
                  {statusFilter === "ALL"
                    ? "Todos"
                    : statusFilter === "NORMAL"
                    ? "Normal"
                    : statusFilter === "DELAY"
                    ? "Demora"
                    : "Incidente"}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 font-medium">
                Micros:{" "}
                <span className="font-semibold text-slate-900">
                  {filteredBuses.length}
                </span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => {
                  setAddBusOpen(true);
                  setAddBusError(null);
                  setAddBusSuccess(null);
                }}
                className="inline-flex h-9 items-center rounded-lg border border-sky-500 bg-sky-50 px-3 text-xs font-semibold text-sky-800 hover:bg-sky-100"
              >
                Añadir micro
              </button>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as StatusFilter
                  )
                }
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs outline-none ring-sky-500/10 focus:border-sky-500 focus:ring-2"
              >
                <option value="ALL">Todos los estados</option>
                <option value="NORMAL">Normal</option>
                <option value="DELAY">Demora</option>
                <option value="INCIDENT">Incidente</option>
              </select>
              <input
                type="text"
                value={routeFilter}
                onChange={(e) =>
                  setRouteFilter(e.target.value)
                }
                placeholder="Filtrar por ruta..."
                className="h-9 w-40 rounded-lg border border-slate-300 bg-white px-3 text-xs outline-none ring-sky-500/10 placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 sm:w-52"
              />
            </div>
          </div>

          {dashError && (
            <p className="mb-3 text-xs text-red-600">
              {dashError}
            </p>
          )}
          {deleteSuccess && (
            <p className="mb-3 text-xs font-medium text-emerald-700">
              {deleteSuccess}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 font-semibold text-slate-600">
                    Unidad
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-600">
                    Patente
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-600">
                    Chofer
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-600">
                    GPS
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-600">
                    Ruta
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-600">
                    Empresa
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-600">
                    Estado
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-600">
                    Velocidad
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-600">
                    Lat / Lng
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-600">
                    Actualizado
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-600">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingDash && !dashboard && (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-3 py-6 text-center text-xs text-slate-500"
                    >
                      Cargando dashboard...
                    </td>
                  </tr>
                )}
                {!loadingDash &&
                  filteredBuses.map((bus) => (
                    <tr
                      key={bus.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedBusId(bus.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ")
                          setSelectedBusId(bus.id);
                      }}
                      className={`cursor-pointer bg-white/50 hover:bg-slate-50 ${
                        selectedBusId === bus.id
                          ? "bg-sky-50 ring-1 ring-inset ring-sky-200"
                          : ""
                      }`}
                    >
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-slate-900">
                        {bus.unitId}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[11px] font-medium text-slate-900">
                        {bus.plate}
                      </td>
                      <td className="max-w-[100px] truncate px-3 py-2 text-[11px] text-slate-700">
                        {bus.driverName ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[11px] text-slate-600">
                        {bus.gpsType === "external"
                          ? "Externo"
                          : bus.gpsType === "mobile"
                            ? "Celular"
                            : "—"}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-slate-700">
                        {bus.routeName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[11px] text-slate-700">
                        {bus.company}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ${statusBadgeClasses(
                            bus.status
                          )}`}
                        >
                          {bus.status === "NORMAL"
                            ? "Normal"
                            : bus.status === "DELAY"
                            ? "Demora"
                            : "Incidente"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[11px] text-slate-700">
                        {Math.round(bus.speedKmh)} km/h
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-slate-600">
                        {bus.gpsPending || !bus.position
                          ? "GPS pendiente"
                          : `${bus.position.lat.toFixed(4)}, ${bus.position.lng.toFixed(4)}`}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[11px] text-slate-600">
                        {formatTime(bus.updatedAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[11px]">
                        <div
                          className="flex flex-wrap items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              openIncidentForm(bus.id)
                            }
                            className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800 hover:bg-amber-100"
                          >
                            Crear incidente
                          </button>
                          {bus.activeIncident && (
                            <button
                              type="button"
                              onClick={() =>
                                resolveIncident(
                                  bus.activeIncident!.id
                                )
                              }
                              className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-800 hover:bg-emerald-100"
                            >
                              Resolver incidente
                            </button>
                          )}
                          {isCustomBus(bus.id) && (
                            <button
                              type="button"
                              onClick={() => confirmDeleteBus(bus.id)}
                              className="inline-flex items-center rounded-full border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-800 hover:bg-red-100"
                            >
                              Borrar micro
                            </button>
                          )}
                        </div>
                        {bus.activeIncident && (
                          <p
                            className="mt-1 max-w-[220px] text-[10px] text-slate-500"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {bus.activeIncident.type} ·{" "}
                            {bus.activeIncident.description} · ETA{" "}
                            {bus.activeIncident.etaMinutes} min
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                {!loadingDash &&
                  filteredBuses.length === 0 && (
                    <tr>
                      <td
                        colSpan={11}
                        className="px-3 py-6 text-center text-xs text-slate-500"
                      >
                        No hay micros que coincidan con los filtros
                        seleccionados.
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Panel detalle + mapa + estadísticas del micro seleccionado */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">
              Detalle del micro
            </h2>
            {selectedBus && (
              <button
                type="button"
                onClick={() => setSelectedBusId(null)}
                className="text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                Cerrar selección
              </button>
            )}
          </div>
          {!selectedBus && (
            <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Seleccioná un micro para ver detalles y estadísticas
            </div>
          )}
          {selectedBus && (
            <>
              {/* Fila mapa + acciones rápidas */}
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <div className="min-h-[280px]">
                  {selectedBus.gpsPending || !selectedBus.position ? (
                    <div className="flex min-h-[280px] flex-col justify-center gap-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-900">
                      <div className="text-center">
                        <p className="font-semibold">GPS pendiente de conexión</p>
                        <p className="mt-2 mx-auto max-w-sm text-xs text-amber-800">
                          Conectá este celular para enviar la ubicación en vivo.
                          busId:{" "}
                          <code className="rounded bg-white px-1">
                            {selectedBus.id}
                          </code>
                        </p>
                      </div>
                      {selectedBus.gpsType === "mobile" && (
                        <MobileGpsConnect
                          busId={selectedBus.id}
                          onLocationSent={() => loadDashboard(false, true)}
                        />
                      )}
                    </div>
                  ) : (
                    <BusMap
                      position={selectedBus.position}
                      routeWaypoints={selectedBus.routeWaypoints}
                      currentWaypointIndex={selectedBus.currentWaypointIndex}
                    />
                  )}
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-900">
                      {selectedBus.unitId}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="font-medium text-slate-800">
                      {selectedBus.plate}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${statusBadgeClasses(
                        selectedBus.status
                      )}`}
                    >
                      {statusLabel(selectedBus.status)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{selectedBus.routeName}</p>
                  {(selectedBus.driverName || selectedBus.gpsType) && (
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                      {selectedBus.driverName && (
                        <p>
                          <span className="text-slate-500">Chofer:</span>{" "}
                          <span className="font-medium text-slate-800">
                            {selectedBus.driverName}
                          </span>
                        </p>
                      )}
                      {selectedBus.gpsType && (
                        <p className="mt-1">
                          <span className="text-slate-500">GPS:</span>{" "}
                          <span className="font-medium text-slate-800">
                            {selectedBus.gpsType === "external"
                              ? "Externo (integración pendiente)"
                              : "Celular"}
                          </span>
                        </p>
                      )}
                      {selectedBus.gpsType === "mobile" &&
                        selectedBus.position && (
                          <div className="mt-3">
                            <p className="mb-2 text-[10px] font-medium text-sky-900">
                              Reconectar o seguir enviando desde este dispositivo
                            </p>
                            <MobileGpsConnect
                              busId={selectedBus.id}
                              onLocationSent={() => loadDashboard(false, true)}
                            />
                          </div>
                        )}
                      {selectedBus.gpsType === "external" && (
                        <p className="mt-2 text-[10px] text-amber-800">
                          Espacio reservado para ID de dispositivo / API externa.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Incidente activo
                    </p>
                    {selectedBus.activeIncident ? (
                      <div className="text-xs text-slate-800">
                        <p className="font-medium">
                          {selectedBus.activeIncident.type} ·{" "}
                          <span className="capitalize">
                            {selectedBus.activeIncident.severity}
                          </span>
                        </p>
                        <p className="mt-1 text-slate-600">
                          {selectedBus.activeIncident.description}
                        </p>
                        <p className="mt-1 text-slate-500">
                          ETA incidente:{" "}
                          {selectedBus.activeIncident.etaMinutes} min
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        Sin incidente activo
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openIncidentForm(selectedBus.id)}
                      className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[10px] font-medium text-amber-800 hover:bg-amber-100"
                    >
                      Crear incidente
                    </button>
                    {selectedBus.activeIncident && (
                      <button
                        type="button"
                        onClick={() =>
                          resolveIncident(selectedBus.activeIncident!.id)
                        }
                        className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[10px] font-medium text-emerald-800 hover:bg-emerald-100"
                      >
                        Resolver incidente
                      </button>
                    )}
                    {isCustomBus(selectedBus.id) && (
                      <button
                        type="button"
                        onClick={() => confirmDeleteBus(selectedBus.id)}
                        className="rounded-full border border-red-300 bg-red-50 px-3 py-1 text-[10px] font-medium text-red-800 hover:bg-red-100"
                      >
                        Borrar micro
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Detalles del micro + Estadísticas (solo seleccionado) */}
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Detalles del micro
                  </h3>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                    <dt className="text-slate-500">Identificador</dt>
                    <dd className="font-mono font-medium text-slate-900">
                      {selectedBus.unitId}
                    </dd>
                    <dt className="text-slate-500">Patente</dt>
                    <dd className="font-medium text-slate-900">
                      {selectedBus.plate}
                    </dd>
                    <dt className="text-slate-500">Chofer</dt>
                    <dd className="text-slate-800">
                      {selectedBus.driverName ?? "—"}
                    </dd>
                    <dt className="text-slate-500">Tipo de GPS</dt>
                    <dd className="text-slate-800">{gpsTypeLabel(selectedBus)}</dd>
                    <dt className="text-slate-500">Empresa</dt>
                    <dd className="text-slate-800">{selectedBus.company}</dd>
                    <dt className="text-slate-500">Estado actual</dt>
                    <dd>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${statusBadgeClasses(
                          selectedBus.status
                        )}`}
                      >
                        {statusLabel(selectedBus.status)}
                      </span>
                    </dd>
                    <dt className="text-slate-500">Última actualización</dt>
                    <dd className="text-slate-700">
                      {formatDateTime(selectedBus.updatedAt)}
                    </dd>
                    <dt className="text-slate-500">Ruta asignada</dt>
                    <dd className="text-slate-700">{selectedBus.routeName}</dd>
                    <dt className="text-slate-500">Código de viaje</dt>
                    <dd className="font-mono text-slate-900">
                      {selectedBus.tripCode ?? "—"}
                    </dd>
                    {(selectedBus.tripOrigin || selectedBus.tripDestination) && (
                      <>
                        <dt className="text-slate-500">Origen / Destino</dt>
                        <dd className="text-slate-700">
                          {selectedBus.tripOrigin ?? "—"} →{" "}
                          {selectedBus.tripDestination ?? "—"}
                        </dd>
                      </>
                    )}
                  </dl>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Estadísticas
                  </h3>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                    <dt className="text-slate-500">Velocidad actual</dt>
                    <dd className="font-medium text-slate-900">
                      {Math.round(selectedBus.speedKmh)} km/h
                    </dd>
                    <dt className="text-slate-500">ETA</dt>
                    <dd className="font-medium text-slate-900">
                      {selectedBus.etaMinutes <= 0
                        ? "En terminal"
                        : `${selectedBus.etaMinutes} min`}
                    </dd>
                    <dt className="text-slate-500">Km recorridos</dt>
                    <dd className="text-slate-800">
                      {kmRecorridosAprox(selectedBus)}
                    </dd>
                    <dt className="text-slate-500">Tiempo activo</dt>
                    <dd className="text-slate-600">
                      Demo: sesión en curso (sin histórico persistido)
                    </dd>
                    <dt className="text-slate-500">Cantidad de incidentes</dt>
                    <dd className="text-slate-800">
                      {selectedBus.activeIncident ? "1 activo" : "0 activos"}{" "}
                      <span className="text-slate-500">
                        (solo incidente actual en demo)
                      </span>
                    </dd>
                    <dt className="text-slate-500">Tiempo detenido</dt>
                    <dd className="text-slate-600">
                      {selectedBus.speedKmh < 5
                        ? "Posiblemente detenido (velocidad baja)"
                        : "En movimiento (estimado por velocidad simulada)"}
                    </dd>
                    <dt className="text-slate-500">Última conexión GPS</dt>
                    <dd className="text-slate-800">
                      {selectedBus.gpsType === "mobile" && selectedBus.position
                        ? formatDateTime(selectedBus.updatedAt)
                        : selectedBus.gpsType === "mobile"
                          ? "Sin conexión aún"
                          : "N/D (simulación demo)"}
                    </dd>
                  </dl>
                </div>
              </div>

              {/* Editar código de viaje (identificador para /passenger) */}
              <div className="mt-6 rounded-lg border border-sky-200 bg-sky-50/40 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-900">
                  Código de viaje del micro
                </h3>
                <p className="mb-3 text-xs text-sky-800">
                  Los pasajeros buscan con <strong>empresa</strong> + este{" "}
                  <strong>código</strong>. Debe ser único entre los micros de
                  tu empresa.
                </p>
                <form
                  className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setTripMetaSaving(true);
                    setTripMetaMessage(null);
                    try {
                      const res = await fetch(
                        `/api/company/buses/${encodeURIComponent(selectedBus.id)}/trip`,
                        {
                          method: "PATCH",
                          credentials: "same-origin",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            tripCode: tripMetaForm.tripCode.trim(),
                            tripOrigin:
                              tripMetaForm.tripOrigin.trim() || undefined,
                            tripDestination:
                              tripMetaForm.tripDestination.trim() ||
                              undefined,
                          }),
                        }
                      );
                      const d = await res.json().catch(() => null);
                      if (!res.ok) throw new Error(d?.error ?? "Error");
                      setTripMetaMessage("Código de viaje actualizado");
                      await loadDashboard(false, true);
                    } catch (err) {
                      setTripMetaMessage(
                        err instanceof Error ? err.message : "Error"
                      );
                    } finally {
                      setTripMetaSaving(false);
                    }
                  }}
                >
                  <div className="min-w-[140px] flex-1">
                    <label className="mb-1 block text-[10px] font-medium text-slate-600">
                      Código de viaje *
                    </label>
                    <input
                      value={tripMetaForm.tripCode}
                      onChange={(e) =>
                        setTripMetaForm((p) => ({
                          ...p,
                          tripCode: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono"
                      required
                    />
                  </div>
                  <div className="min-w-[120px] flex-1">
                    <label className="mb-1 block text-[10px] font-medium text-slate-600">
                      Origen (opc.)
                    </label>
                    <input
                      value={tripMetaForm.tripOrigin}
                      onChange={(e) =>
                        setTripMetaForm((p) => ({
                          ...p,
                          tripOrigin: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="min-w-[120px] flex-1">
                    <label className="mb-1 block text-[10px] font-medium text-slate-600">
                      Destino (opc.)
                    </label>
                    <input
                      value={tripMetaForm.tripDestination}
                      onChange={(e) =>
                        setTripMetaForm((p) => ({
                          ...p,
                          tripDestination: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={tripMetaSaving}
                    className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    {tripMetaSaving ? "Guardando…" : "Guardar código"}
                  </button>
                </form>
                {tripMetaMessage && (
                  <p className="mt-2 text-xs text-slate-700">{tripMetaMessage}</p>
                )}
              </div>

              {/* Pasajes asociados al micro */}
              <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Pasajes del micro
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setTicketModalOpen(true);
                      setTicketError(null);
                      setTicketSuccess(null);
                      setTicketForm({
                        ticketCode: "",
                        passengerName: "",
                        origin: "",
                        destination: "",
                      });
                    }}
                    className="rounded-lg border border-sky-500 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                  >
                    Añadir pasaje
                  </button>
                </div>
                {ticketSuccess && (
                  <p className="mb-2 text-xs font-medium text-emerald-700">
                    {ticketSuccess}
                  </p>
                )}
                {ticketError && !ticketModalOpen && (
                  <p className="mb-2 text-xs text-red-600">{ticketError}</p>
                )}
                {ticketsLoading ? (
                  <p className="text-xs text-slate-500">Cargando pasajes…</p>
                ) : busTickets.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Ningún pasaje creado para este micro. Los pasajeros pueden
                    buscar por número solo si agregás un pasaje aquí (además
                    de los códigos demo del micro).
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="pb-2 pr-3 font-medium">Nº pasaje</th>
                          <th className="pb-2 pr-3 font-medium">Pasajero</th>
                          <th className="pb-2 pr-3 font-medium">Origen</th>
                          <th className="pb-2 pr-3 font-medium">Destino</th>
                          <th className="pb-2 font-medium">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {busTickets.map((t) => (
                          <tr
                            key={t.id}
                            className="border-b border-slate-100 last:border-0"
                          >
                            <td className="py-2 pr-3 font-mono font-medium">
                              {t.ticketCode}
                            </td>
                            <td className="py-2 pr-3 text-slate-700">
                              {t.passengerName ?? "—"}
                            </td>
                            <td className="py-2 pr-3 text-slate-600">
                              {t.origin ?? "—"}
                            </td>
                            <td className="py-2 pr-3 text-slate-600">
                              {t.destination ?? "—"}
                            </td>
                            <td className="py-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (
                                    !confirm(
                                      "¿Eliminar este pasaje? El pasajero ya no podrá buscarlo."
                                    )
                                  )
                                    return;
                                  const res = await fetch(
                                    `/api/company/tickets/${encodeURIComponent(t.id)}`,
                                    {
                                      method: "DELETE",
                                      credentials: "same-origin",
                                    }
                                  );
                                  const data = await res.json().catch(() => null);
                                  if (!res.ok) {
                                    setTicketError(
                                      data?.error ?? "No se pudo eliminar"
                                    );
                                    return;
                                  }
                                  setTicketSuccess(
                                    "Pasaje eliminado correctamente"
                                  );
                                  void loadBusTickets(selectedBus.id);
                                  setTimeout(() => setTicketSuccess(null), 3000);
                                }}
                                className="text-red-600 hover:underline"
                              >
                                Borrar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* Modal añadir pasaje */}
        {ticketModalOpen && selectedBus && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-modal-title"
          >
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
              <h2
                id="ticket-modal-title"
                className="mb-4 text-lg font-semibold text-slate-900"
              >
                Añadir pasaje — {selectedBus.unitId}
              </h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setTicketError(null);
                  if (!ticketForm.ticketCode.trim()) {
                    setTicketError("El número de pasaje es obligatorio.");
                    return;
                  }
                  setTicketSubmitting(true);
                  try {
                    const res = await fetch("/api/company/tickets", {
                      method: "POST",
                      credentials: "same-origin",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        busId: selectedBus.id,
                        ticketCode: ticketForm.ticketCode.trim(),
                        passengerName:
                          ticketForm.passengerName.trim() || undefined,
                        origin: ticketForm.origin.trim() || undefined,
                        destination:
                          ticketForm.destination.trim() || undefined,
                      }),
                    });
                    const data = await res.json().catch(() => null);
                    if (!res.ok) {
                      throw new Error(data?.error ?? "Error al crear pasaje");
                    }
                    setTicketSuccess(data?.message ?? "Pasaje creado correctamente");
                    setTicketModalOpen(false);
                    void loadBusTickets(selectedBus.id);
                    setTimeout(() => setTicketSuccess(null), 4000);
                  } catch (err) {
                    setTicketError(
                      err instanceof Error ? err.message : "Error al crear"
                    );
                  } finally {
                    setTicketSubmitting(false);
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Número de pasaje <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={ticketForm.ticketCode}
                    onChange={(e) =>
                      setTicketForm((p) => ({
                        ...p,
                        ticketCode: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Ej. PAS2025-001"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Nombre del pasajero (opcional)
                  </label>
                  <input
                    type="text"
                    value={ticketForm.passengerName}
                    onChange={(e) =>
                      setTicketForm((p) => ({
                        ...p,
                        passengerName: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Origen (opcional)
                  </label>
                  <input
                    type="text"
                    value={ticketForm.origin}
                    onChange={(e) =>
                      setTicketForm((p) => ({ ...p, origin: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Destino (opcional)
                  </label>
                  <input
                    type="text"
                    value={ticketForm.destination}
                    onChange={(e) =>
                      setTicketForm((p) => ({
                        ...p,
                        destination: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                {ticketError && (
                  <p className="text-xs text-red-600">{ticketError}</p>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setTicketModalOpen(false)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={ticketSubmitting}
                    className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    {ticketSubmitting ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal confirmar borrar micro */}
        {deleteConfirmBusId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-bus-title"
          >
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
              <h2
                id="delete-bus-title"
                className="mb-2 text-lg font-semibold text-slate-900"
              >
                ¿Seguro que querés eliminar este micro?
              </h2>
              <p className="mb-4 text-sm text-slate-600">
                Se quitará de la flota y del almacenamiento demo. No se puede
                deshacer.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmBusId(null)}
                  disabled={deleteSubmitting}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void executeDeleteBus()}
                  disabled={deleteSubmitting}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteSubmitting ? "Eliminando…" : "Eliminar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Añadir micro */}
        {addBusOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-bus-title"
          >
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
              <h2
                id="add-bus-title"
                className="mb-4 text-lg font-semibold text-slate-900"
              >
                Añadir micro
              </h2>
              <form onSubmit={submitAddBus} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Nombre o identificador{" "}
                    <span className="font-normal text-slate-400">
                      (opcional)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={addBusForm.unitId}
                    onChange={(e) =>
                      setAddBusForm((p) => ({
                        ...p,
                        unitId: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                    placeholder="Ej. Micro 1, Vehículo 12"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    Si lo dejás vacío se asigna automáticamente (ej. Micro 1).
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Patente <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={addBusForm.plate}
                    onChange={(e) =>
                      setAddBusForm((p) => ({
                        ...p,
                        plate: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                    placeholder="AA123BB"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Chofer o responsable
                  </label>
                  <input
                    type="text"
                    value={addBusForm.driverName}
                    onChange={(e) =>
                      setAddBusForm((p) => ({
                        ...p,
                        driverName: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                    placeholder="Nombre de quien maneja el micro"
                  />
                </div>
                <div>
                  <span className="mb-2 block text-xs font-medium text-slate-600">
                    Tipo de GPS
                  </span>
                  <div className="flex flex-col gap-2">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50">
                      <input
                        type="radio"
                        name="gpsType"
                        checked={addBusForm.gpsType === "mobile"}
                        onChange={() =>
                          setAddBusForm((p) => ({ ...p, gpsType: "mobile" }))
                        }
                        className="text-sky-600"
                      />
                      <span>GPS del celular</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50">
                      <input
                        type="radio"
                        name="gpsType"
                        checked={addBusForm.gpsType === "external"}
                        onChange={() =>
                          setAddBusForm((p) => ({ ...p, gpsType: "external" }))
                        }
                        className="text-sky-600"
                      />
                      <span>GPS externo</span>
                    </label>
                  </div>
                  {addBusForm.gpsType === "mobile" && (
                    <p className="mt-2 rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2 text-[10px] text-sky-900">
                      Este micro quedará con <code className="rounded bg-white px-1">gpsType: mobile</code>.
                      Más adelante podrás vincular el celular del chofer a esta unidad desde el detalle.
                    </p>
                  )}
                  {addBusForm.gpsType === "external" && (
                    <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-[10px] text-amber-900">
                      Guardado como <code className="rounded bg-white px-1">gpsType: external</code>.
                      Campos para integrar GPS externo (API / dispositivo) se pueden agregar aquí después.
                    </p>
                  )}
                </div>
                {addBusError && (
                  <p className="text-xs text-red-600">{addBusError}</p>
                )}
                {addBusSuccess && (
                  <p className="text-xs font-medium text-emerald-700">
                    {addBusSuccess}
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAddBusOpen(false);
                      setAddBusError(null);
                      setAddBusSuccess(null);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={addBusSubmitting}
                    className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    {addBusSubmitting ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {incidentForm.busId && (
          <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm shadow-sm">
            <form
              onSubmit={submitIncident}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-amber-900">
                  Tipo de incidente
                </label>
                <input
                  type="text"
                  value={incidentForm.type}
                  onChange={(e) =>
                    setIncidentForm((prev) => ({
                      ...prev,
                      type: e.target.value,
                    }))
                  }
                  className="block w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none ring-amber-500/10 placeholder:text-amber-400 focus:border-amber-500 focus:ring-2"
                  placeholder="Demora, clima, desvío, etc."
                />
              </div>
              <div className="w-32">
                <label className="mb-1 block text-xs font-medium text-amber-900">
                  Severidad
                </label>
                <select
                  value={incidentForm.severity}
                  onChange={(e) =>
                    setIncidentForm((prev) => ({
                      ...prev,
                      severity: e.target
                        .value as IncidentFormState["severity"],
                    }))
                  }
                  className="block w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none ring-amber-500/10 focus:border-amber-500 focus:ring-2"
                >
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                </select>
              </div>
              <div className="w-28">
                <label className="mb-1 block text-xs font-medium text-amber-900">
                  ETA (min)
                </label>
                <input
                  type="number"
                  min={0}
                  value={incidentForm.etaMinutes}
                  onChange={(e) =>
                    setIncidentForm((prev) => ({
                      ...prev,
                      etaMinutes: e.target.value,
                    }))
                  }
                  className="block w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none ring-amber-500/10 focus:border-amber-500 focus:ring-2"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-amber-900">
                  Descripción
                </label>
                <input
                  type="text"
                  value={incidentForm.description}
                  onChange={(e) =>
                    setIncidentForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Detalle visible para el pasajero..."
                  className="block w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none ring-amber-500/10 placeholder:text-amber-400 focus:border-amber-500 focus:ring-2"
                />
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="submit"
                  disabled={incidentForm.submitting}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-amber-700 px-4 text-sm font-medium text-amber-50 shadow-sm transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-amber-500"
                >
                  {incidentForm.submitting
                    ? "Guardando..."
                    : "Confirmar incidente"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setIncidentForm((prev) => ({
                      ...prev,
                      busId: null,
                    }))
                  }
                  className="text-xs font-medium text-amber-800 hover:text-amber-900"
                >
                  Cancelar
                </button>
              </div>
            </form>
            {incidentForm.error && (
              <p className="mt-2 text-xs text-red-700">
                {incidentForm.error}
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

