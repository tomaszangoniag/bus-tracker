'use client';

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  useMap,
} from "react-leaflet";
import type { LatLngExpression } from "leaflet";

export interface BusMapProps {
  /** Posición del marcador (debe coincidir con routeWaypoints[currentWaypointIndex]) */
  position: { lat: number; lng: number } | null;
  /** Polyline completa de la ruta */
  routeWaypoints?: { lat: number; lng: number }[];
  /** Índice del punto actual sobre routeWaypoints (tramo recorrido = [0..idx], restante = [idx..end]) */
  currentWaypointIndex?: number;
}

function MapCenterUpdater({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [map, lat, lng]);
  return null;
}

function toLatLngs(points: { lat: number; lng: number }[]): LatLngExpression[] {
  return points.map((w) => [w.lat, w.lng]);
}

export default function BusMap({
  position,
  routeWaypoints,
  currentWaypointIndex = 0,
}: BusMapProps) {
  if (
    !position ||
    position.lat == null ||
    position.lng == null ||
    !Number.isFinite(position.lat) ||
    !Number.isFinite(position.lng)
  ) {
    return (
      <div className="flex h-full min-h-[260px] w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
        Sin posición en mapa (GPS pendiente o sin datos)
      </div>
    );
  }

  const { traveled, remaining } = useMemo(() => {
    const wps = routeWaypoints ?? [];
    if (wps.length < 2) {
      return { traveled: undefined as LatLngExpression[] | undefined, remaining: undefined as LatLngExpression[] | undefined };
    }
    const idx = Math.max(0, Math.min(currentWaypointIndex, wps.length - 1));
    const traveledPoints = wps.slice(0, idx + 1);
    const remainingPoints = wps.slice(idx);
    return {
      traveled: toLatLngs(traveledPoints),
      remaining: toLatLngs(remainingPoints.length >= 2 ? remainingPoints : wps.slice(idx)),
    };
  }, [routeWaypoints, currentWaypointIndex]);

  return (
    <div className="h-full min-h-[260px] w-full overflow-hidden rounded-xl border border-slate-200">
      <MapContainer
        center={[position.lat, position.lng]}
        zoom={6}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapCenterUpdater lat={position.lat} lng={position.lng} />
        {traveled && traveled.length >= 2 && (
          <Polyline
            positions={traveled}
            pathOptions={{ color: "#94a3b8", weight: 4, opacity: 0.9 }}
          />
        )}
        {remaining && remaining.length >= 2 && (
          <Polyline
            positions={remaining}
            pathOptions={{ color: "#0ea5e9", weight: 4, opacity: 0.95 }}
          />
        )}
        <CircleMarker
          center={[position.lat, position.lng]}
          radius={10}
          pathOptions={{
            color: "#22c55e",
            weight: 3,
            fillColor: "#22c55e",
            fillOpacity: 0.8,
          }}
        />
      </MapContainer>
    </div>
  );
}
