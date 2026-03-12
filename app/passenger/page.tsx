'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

const BusMap = dynamic(() => import("../../components/BusMap"), {
  ssr: false,
});

interface TripResponse {
  tripId: string;
  ticketCode: string;
  company: string;
  state: "NORMAL" | "DELAY" | "INCIDENT";
  etaMinutes: number;
  lastUpdate: number;
  routeWaypoints: { lat: number; lng: number }[];
  currentWaypointIndex: number;
  progressPercent: number;
  incident: {
    id: string;
    type: string;
    severity: "low" | "medium" | "high";
    description: string;
    etaMinutes: number;
  } | null;
  bus: {
    id: string;
    unitId: string;
    plate: string;
    routeName: string;
    company: string;
    status: "NORMAL" | "DELAY" | "INCIDENT";
    speedKmh: number;
    updatedAt: number;
    position: { lat: number; lng: number };
    waypoints: { lat: number; lng: number }[];
  };
}

interface EventItem {
  id: string;
  tripId: string;
  busId: string;
  type: string;
  message: string;
  createdAt: number;
}

interface ToastState {
  id: number;
  message: string;
  tone: "success" | "warning" | "error" | "info";
}

/** Fallback si la API no responde (compat demo) */
const FALLBACK_COMPANIES: { slug: string; name: string }[] = [
  { slug: "flechabus", name: "FlechaBus" },
  { slug: "plusmar", name: "Plusmar" },
];

function formatTime(ts: number | null | undefined) {
  if (!ts) return "-";
  return new Date(ts).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRelativeMinutes(minutes: number | null | undefined) {
  if (!minutes) return "-";
  if (minutes <= 0) return "En terminal";
  return `${minutes} min`;
}

function statusConfig(state: TripResponse["state"]) {
  switch (state) {
    case "NORMAL":
      return {
        label: "Normal",
        color: "bg-emerald-500 text-emerald-50",
        border: "border-emerald-600",
      };
    case "DELAY":
      return {
        label: "Demora",
        color: "bg-amber-400 text-amber-950",
        border: "border-amber-500",
      };
    case "INCIDENT":
      return {
        label: "Incidente",
        color: "bg-red-500 text-red-50",
        border: "border-red-600",
      };
    default:
      return {
        label: "Desconocido",
        color: "bg-slate-500 text-slate-50",
        border: "border-slate-600",
      };
  }
}

export default function PassengerPage() {
  const [ticketCode, setTicketCode] = useState("ABC123");
  /** Slug empresa — valor del select; debe coincidir con company en API trip */
  const [company, setCompany] = useState<string>("flechabus");
  const [companyOptions, setCompanyOptions] = useState<
    { slug: string; name: string }[]
  >(FALLBACK_COMPANIES);
  const [myTrips, setMyTrips] = useState<
    Array<{
      ticketCode: string;
      companySlug: string;
      companyName: string;
      routeName: string;
    }>
  >([]);
  const [trip, setTrip] = useState<TripResponse | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const lastStateRef = useRef<TripResponse["state"] | null>(null);
  const lastIncidentIdRef = useRef<string | null>(null);
  const toastIdRef = useRef(0);

  const showToast = (message: string, tone: ToastState["tone"]) => {
    const nextId = toastIdRef.current + 1;
    toastIdRef.current = nextId;
    setToast({ id: nextId, message, tone });

    setTimeout(() => {
      setToast((current) =>
        current && current.id === nextId ? null : current
      );
    }, 3500);
  };

  // Cargar lista de empresas (seed + creadas en demo) — fuente única vía API
  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/companies")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.companies?.length) return;
        const opts = data.companies.map(
          (c: { slug: string; name: string }) => ({
            slug: c.slug,
            name: c.name,
          })
        );
        setCompanyOptions(opts);
        // Si el slug actual no está en la lista, usar el primero
        setCompany((prev) =>
          opts.some((o: { slug: string }) => o.slug === prev)
            ? prev
            : opts[0].slug
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // /passenger es ruta pública: no redirigir según rol.
  // Solo cargamos "Mis viajes" si hay sesión de pasajero.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/auth/session");
      const data = await res.json();
      if (cancelled) return;
      if (data.user?.role === "passenger") {
        const tr = await fetch("/api/passenger/trips", {
          credentials: "same-origin",
        });
        if (tr.ok) {
          const t = await tr.json();
          setMyTrips(t.trips ?? []);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadData = async (
    initial = false,
    ticket?: string,
    companySlug?: string
  ) => {
    const t = ticket ?? ticketCode;
    const c = companySlug ?? company;
    try {
      if (initial) {
        setLoading(true);
        setError(null);
      }

      const tripRes = await fetch(
        `/api/public/trip?tripCode=${encodeURIComponent(
          t
        )}&company=${encodeURIComponent(c)}`,
        { cache: "no-store", credentials: "same-origin" }
      );

      if (!tripRes.ok) {
        const payload = await tripRes.json().catch(() => null);
        const message =
          payload?.error ??
          "No se encontró el viaje. Revisá el código de viaje y la empresa.";
        setError(message);
        setTrip(null);
        setEvents([]);
        return;
      }

      const tripData: TripResponse = await tripRes.json();
      setTrip(tripData);
      setError(null);

      const eventsRes = await fetch(
        `/api/public/events?tripId=${encodeURIComponent(
          tripData.tripId
        )}`,
        { cache: "no-store", credentials: "same-origin" }
      );
      if (eventsRes.ok) {
        const eventsPayload: { events: EventItem[] } =
          await eventsRes.json();
        setEvents(eventsPayload.events ?? []);
      }

      const prevState = lastStateRef.current;
      const prevIncidentId = lastIncidentIdRef.current;
      const currentState = tripData.state;
      const currentIncidentId = tripData.incident?.id ?? null;

      if (prevState && prevState !== currentState) {
        if (currentState === "NORMAL") {
          showToast("El servicio volvió a la normalidad.", "success");
        } else if (currentState === "DELAY") {
          showToast("El servicio presenta demoras.", "warning");
        } else if (currentState === "INCIDENT") {
          showToast(
            "Se registró un incidente en tu viaje.",
            "error"
          );
        }
      }

      if (prevIncidentId !== currentIncidentId) {
        if (!prevIncidentId && currentIncidentId) {
          showToast("Nuevo incidente reportado.", "error");
        } else if (prevIncidentId && !currentIncidentId) {
          showToast("Incidente resuelto para tu viaje.", "success");
        }
      }

      lastStateRef.current = currentState;
      lastIncidentIdRef.current = currentIncidentId;
    } catch (e) {
      console.error(e);
      setError("Ocurrió un error al obtener los datos.");
    } finally {
      if (initial) setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadInitial = async () => {
      if (cancelled) return;
      await loadData(true);
    };

    loadInitial();

    const intervalId = setInterval(() => {
      if (!cancelled) {
        loadData(false);
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketCode, company]);

  const statusInfo = useMemo(
    () => (trip ? statusConfig(trip.state) : null),
    [trip]
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4">
          <div
            className={`pointer-events-auto max-w-md rounded-lg border px-4 py-3 text-sm shadow-lg ${
              toast.tone === "success"
                ? "border-emerald-500/70 bg-emerald-50 text-emerald-900"
                : toast.tone === "warning"
                ? "border-amber-500/70 bg-amber-50 text-amber-950"
                : toast.tone === "error"
                ? "border-red-500/70 bg-red-50 text-red-900"
                : "border-slate-400/70 bg-slate-50 text-slate-900"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Seguimiento de viaje
            </h1>
            <p className="text-sm text-slate-500">
              Ingresá el código de viaje y la empresa para ver el
              estado del micro en tiempo real.
            </p>
          </div>
          <a
            href="/"
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Volver al inicio
          </a>
        </header>

        {myTrips.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              Mis viajes
            </h2>
            <ul className="flex flex-wrap gap-2">
              {myTrips.map((t) => (
                <li key={t.ticketCode + t.companySlug}>
                  <button
                    type="button"
                    className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-left text-sm hover:bg-sky-100"
                    onClick={() => {
                      setTicketCode(t.ticketCode);
                      setCompany(t.companySlug);
                      loadData(true, t.ticketCode, t.companySlug);
                    }}
                  >
                    <span className="font-mono font-medium">{t.ticketCode}</span>
                    <span className="ml-2 text-slate-600">{t.companyName}</span>
                    <span className="block text-xs text-slate-500">
                      {t.routeName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              loadData(true);
            }}
          >
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Código de viaje
              </label>
              <input
                value={ticketCode}
                onChange={(e) => setTicketCode(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-sky-500/10 placeholder:text-slate-400 focus:border-sky-500 focus:ring-2"
                placeholder="Ej: ABC123 (mismo que en panel empresa)"
              />
            </div>

            <div className="w-full sm:w-56">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Empresa
              </label>
              <select
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-sky-500/10 focus:border-sky-500 focus:ring-2"
              >
                {companyOptions.map((opt) => (
                  <option key={opt.slug} value={opt.slug}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-sky-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-400"
              disabled={loading}
            >
              {loading ? "Buscando..." : "Actualizar ahora"}
            </button>
          </form>

          {error && (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Estado del viaje
                  </p>
                  <p className="text-sm text-slate-500">
                    Ticket:{" "}
                    <span className="font-mono text-slate-800">
                      {trip?.ticketCode ?? ticketCode}
                    </span>
                  </p>
                </div>
                {trip && statusInfo && (
                  <div
                    className={`inline-flex min-w-[120px] items-center justify-center rounded-full border px-4 py-1.5 text-sm font-semibold uppercase tracking-wide ${statusInfo.color} ${statusInfo.border}`}
                  >
                    {statusInfo.label}
                  </div>
                )}
              </div>

              <BusMap
                position={trip?.bus.position ?? null}
                routeWaypoints={
                  trip?.routeWaypoints ?? trip?.bus.waypoints
                }
                currentWaypointIndex={
                  trip?.currentWaypointIndex ?? 0
                }
              />
              {trip && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>Progreso del viaje</span>
                    <span className="font-medium text-slate-700">
                      {trip.progressPercent}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-sky-500 transition-all duration-500"
                      style={{ width: `${trip.progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">
                Detalles del viaje
              </h2>
              {trip ? (
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-slate-500">Empresa</dt>
                    <dd className="font-medium text-slate-900">
                      {trip.company}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-slate-500">Ruta</dt>
                    <dd className="text-right font-medium text-slate-900">
                      {trip.bus.routeName}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-slate-500">Unidad / Patente</dt>
                    <dd className="text-right text-sm font-medium text-slate-900">
                      {trip.bus.unitId} · {trip.bus.plate}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-slate-500">Velocidad</dt>
                    <dd className="font-medium text-slate-900">
                      {Math.round(trip.bus.speedKmh)} km/h
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-slate-500">ETA estimado</dt>
                    <dd className="font-semibold text-slate-900">
                      {formatRelativeMinutes(trip.etaMinutes)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-slate-500">
                      Última actualización
                    </dt>
                    <dd className="text-xs font-medium text-slate-800">
                      {formatTime(trip.lastUpdate)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-slate-500">
                  Ingresá un código válido para ver los detalles.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">
                Incidente
              </h2>
              {trip?.incident ? (
                <div className="space-y-2 text-sm">
                  <p className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                    {trip.incident.type} ·{" "}
                    <span className="capitalize">
                      {trip.incident.severity}
                    </span>
                  </p>
                  <p className="text-slate-700">
                    {trip.incident.description}
                  </p>
                  <p className="text-xs text-slate-500">
                    ETA ajustado:{" "}
                    <span className="font-semibold text-slate-800">
                      {formatRelativeMinutes(
                        trip.incident.etaMinutes
                      )}
                    </span>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No hay incidentes activos reportados para este viaje.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">
                Últimos eventos
              </h2>
              {events.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Aún no hay eventos registrados para este viaje.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {events.map((ev) => (
                    <li
                      key={ev.id}
                      className="rounded-lg bg-slate-50 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          {ev.type.replace(/_/g, " ")}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatTime(ev.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-slate-800">
                        {ev.message}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

