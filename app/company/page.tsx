'use client';

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { clearDemoSession } from "@/lib/authClient";

const BusMap = dynamic(() => import("@/components/BusMap"), { ssr: false });

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
  lat: number;
  lng: number;
  position: { lat: number; lng: number } | null;
  lat?: number | null;
  lng?: number | null;
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
}

interface DashboardResponse {
  buses: DashboardBus[];
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
      const data: DashboardResponse = await res.json();
      // Nueva referencia para forzar re-render (incidentes activos / resueltos)
      setDashboard({
        buses: data.buses.map((b) => ({
          ...b,
          driverName: b.driverName,
          gpsType: b.gpsType,
          activeIncident: b.activeIncident
            ? { ...b.activeIncident }
            : null,
          position: b.position ?? (b.lat != null && b.lng != null ? { lat: b.lat, lng: b.lng } : null),
          lat: b.lat,
          lng: b.lng,
          gpsPending: b.gpsPending,
          routeWaypoints: b.routeWaypoints ?? [],
          currentWaypointIndex: b.currentWaypointIndex ?? 0,
          etaMinutes: b.etaMinutes ?? 0,
        })),
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
                        {bus.gpsPending || bus.lat == null || bus.lng == null
                          ? "GPS pendiente"
                          : `${bus.lat.toFixed(4)}, ${bus.lng.toFixed(4)}`}
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

        {/* Panel detalle + mapa del micro seleccionado */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">
              Detalle en mapa
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
              Seleccioná un micro en la tabla para ver el detalle en mapa
            </div>
          )}
          {selectedBus && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="min-h-[280px]">
                {selectedBus.gpsPending || !selectedBus.position ? (
                  <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50/80 px-4 text-center text-sm text-amber-900">
                    <p className="font-semibold">GPS pendiente de conexión</p>
                    <p className="mt-2 max-w-sm text-xs text-amber-800">
                      Este micro usa GPS del celular. Cuando el chofer envíe
                      posición con{" "}
                      <code className="rounded bg-white px-1">POST /api/gps/update</code>{" "}
                      (busId: <code className="rounded bg-white px-1">{selectedBus.id}</code>
                      ), el mapa mostrará la ubicación en vivo.
                    </p>
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
                    {selectedBus.status === "NORMAL"
                      ? "Normal"
                      : selectedBus.status === "DELAY"
                      ? "Demora"
                      : "Incidente"}
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
                    {selectedBus.gpsType === "mobile" && (
                      <p className="mt-2 text-[10px] text-sky-800">
                        Conectar celular: en una próxima versión se podrá
                        vincular la app del chofer a esta unidad (
                        <code className="rounded bg-white px-1">
                          {selectedBus.id}
                        </code>
                        ).
                      </p>
                    )}
                    {selectedBus.gpsType === "external" && (
                      <p className="mt-2 text-[10px] text-amber-800">
                        Espacio reservado para ID de dispositivo / API externa.
                      </p>
                    )}
                  </div>
                )}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <dt className="text-slate-500">Velocidad</dt>
                  <dd className="font-medium text-slate-900">
                    {Math.round(selectedBus.speedKmh)} km/h
                  </dd>
                  <dt className="text-slate-500">ETA estimado</dt>
                  <dd className="font-medium text-slate-900">
                    {selectedBus.etaMinutes <= 0
                      ? "En terminal"
                      : `${selectedBus.etaMinutes} min`}
                  </dd>
                  <dt className="text-slate-500">Actualizado</dt>
                  <dd className="text-slate-700">
                    {formatTime(selectedBus.updatedAt)}
                  </dd>
                </dl>
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
                </div>
              </div>
            </div>
          )}
        </section>

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

