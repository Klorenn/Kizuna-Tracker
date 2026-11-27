"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

type Pin = { id: string; lat: number; lng: number; title: string };

export function OutingMap({ pins }: { pins: Pin[] }) {
  const host = useRef<HTMLDivElement>(null);
  const [tileError, setTileError] = useState(false);
  const pinKey = pins.map((pin) => `${pin.id}:${pin.lat}:${pin.lng}`).join("|");

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled) return;
      map = L.map(node);
      const tiles = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      });
      tiles.on("tileerror", () => setTileError(true));
      tiles.addTo(map);
      const icon = L.divIcon({
        className: "",
        iconSize: [12, 12],
        iconAnchor: [6, 6],
        html: '<span class="block h-3 w-3 rounded-full border border-surface bg-accent"></span>',
      });
      if (pins.length === 0) {
        map.setView([-35.6751, -71.543], 4);
        return;
      }
      for (const pin of pins) {
        L.marker([pin.lat, pin.lng], { icon, title: pin.title }).addTo(map);
      }
      map.fitBounds(
        L.latLngBounds(pins.map((pin) => [pin.lat, pin.lng])),
        { padding: [24, 24], maxZoom: 13 },
      );
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
    // pinKey tracks the pin set. The effect reads `pins` from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey]);

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="h-full w-full" />
      {tileError ? (
        <p role="status" className="absolute inset-x-3 bottom-3 rounded-md bg-surface px-3 py-2 text-center text-small text-ink">
          No pudimos cargar el mapa. Inténtalo de nuevo.
        </p>
      ) : null}
    </div>
  );
}
