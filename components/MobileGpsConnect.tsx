'use client';

import { useCallback, useEffect, useRef, useState } from "react";

type ConnectState = "idle" | "connecting" | "connected" | "error";

interface MobileGpsConnectProps {
  busId: string;
  /** Llamar tras cada envío exitoso para refrescar dashboard/mapa */
  onLocationSent?: () => void;
}

function errorMessage(err: GeolocationPositionError | Error): string {
  if ("code" in err) {
    switch (err.code) {
      case 1:
        return "Permiso denegado. Activá la ubicación para este sitio en el navegador.";
      case 2:
        return "Ubicación no disponible en este momento.";
      case 3:
        return "Tiempo de espera agotado al obtener ubicación.";
      default:
        return err.message || "Error de geolocalización";
    }
  }
  return err.message || "Error desconocido";
}

export default function MobileGpsConnect({
  busId,
  onLocationSent,
}: MobileGpsConnectProps) {
  const [state, setState] = useState<ConnectState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastFix, setLastFix] = useState<{
    lat: number;
    lng: number;
    speedKmh: number | null;
    at: number;
  } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const sendingRef = useRef(false);
  const lastPostAtRef = useRef(0);
  const POST_MIN_INTERVAL_MS = 2500;

  const clearWatch = useCallback(() => {
    if (watchIdRef.current != null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const sendPosition = useCallback(
    async (lat: number, lng: number, speedMs: number | null) => {
      const now = Date.now();
      if (
        lastPostAtRef.current > 0 &&
        now - lastPostAtRef.current < POST_MIN_INTERVAL_MS
      )
        return;
      if (sendingRef.current) return;
      sendingRef.current = true;
      lastPostAtRef.current = now;
      try {
        const res = await fetch("/api/gps/update", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            busId,
            lat,
            lng,
            ...(speedMs != null && Number.isFinite(speedMs) && speedMs >= 0
              ? { speed: speedMs }
              : {}),
            timestamp: Date.now(),
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error ?? "Error al enviar ubicación");
        }
        const speedKmh =
          typeof data?.speedKmh === "number" ? data.speedKmh : null;
        setLastFix({
          lat,
          lng,
          speedKmh,
          at: Date.now(),
        });
        setState("connected");
        onLocationSent?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al enviar");
        setState("error");
      } finally {
        sendingRef.current = false;
      }
    },
    [busId, onLocationSent]
  );

  const startConnect = useCallback(() => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError(
        "Este dispositivo no tiene GPS real o el navegador no soporta geolocalización."
      );
      setState("error");
      return;
    }
    setState("connecting");
    clearWatch();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed } = pos.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          setError("Coordenadas inválidas del dispositivo.");
          setState("error");
          return;
        }
        const speedMs =
          speed != null && Number.isFinite(speed) && speed >= 0
            ? speed
            : null;
        void sendPosition(latitude, longitude, speedMs);
      },
      (geoErr) => {
        setError(errorMessage(geoErr));
        setState("error");
        clearWatch();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );
  }, [clearWatch, sendPosition]);

  const stopConnect = useCallback(() => {
    clearWatch();
    setState("idle");
    setError(null);
  }, [clearWatch]);

  useEffect(() => {
    return () => clearWatch();
  }, [clearWatch]);

  if (typeof navigator !== "undefined" && !navigator.geolocation) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <p className="font-medium text-slate-800">
          Este dispositivo no tiene GPS real o no compartió ubicación
        </p>
        <p className="mt-1 text-slate-600">
          Abrí esta vista desde un celular con GPS y concedé permiso de
          ubicación, o usá el POST manual a <code className="rounded bg-white px-1">/api/gps/update</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/80 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {state === "idle" && (
          <button
            type="button"
            onClick={startConnect}
            className="rounded-lg bg-sky-600 px-3 py-2 font-semibold text-white hover:bg-sky-700"
          >
            Conectar este celular
          </button>
        )}
        {state === "connecting" && (
          <span className="font-medium text-sky-900">
            Conectando GPS…
          </span>
        )}
        {state === "connected" && (
          <>
            <span className="font-medium text-emerald-800">
              GPS conectado
            </span>
            <button
              type="button"
              onClick={stopConnect}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50"
            >
              Detener envío
            </button>
          </>
        )}
        {state === "error" && (
          <>
            <button
              type="button"
              onClick={startConnect}
              className="rounded-lg bg-sky-600 px-3 py-2 font-semibold text-white hover:bg-sky-700"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={stopConnect}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-700"
            >
              Cerrar
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-red-800">
          {error}
        </p>
      )}
      {lastFix && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px]">
          <dt className="text-slate-500">lat</dt>
          <dd className="font-mono text-slate-900">{lastFix.lat.toFixed(6)}</dd>
          <dt className="text-slate-500">lng</dt>
          <dd className="font-mono text-slate-900">{lastFix.lng.toFixed(6)}</dd>
          {lastFix.speedKmh != null && (
            <>
              <dt className="text-slate-500">velocidad</dt>
              <dd className="text-slate-900">
                {Math.round(lastFix.speedKmh)} km/h
              </dd>
            </>
          )}
          <dt className="text-slate-500">último envío</dt>
          <dd className="text-slate-600">
            {new Date(lastFix.at).toLocaleTimeString("es-AR")}
          </dd>
        </dl>
      )}
      <p className="text-[10px] text-sky-800">
        Se usa <code className="rounded bg-white px-1">watchPosition</code> y se
        envía cada actualización a{" "}
        <code className="rounded bg-white px-1">POST /api/gps/update</code> con{" "}
        <code className="rounded bg-white px-1">busId</code> fijo.
      </p>
    </div>
  );
}
