"use client";

import { useEffect, useRef, useState } from "react";
import { LngLatBounds, Map, NavigationControl, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// The bundled chunk cannot sit next to maplibre-gl-worker.mjs, so the phone's worker request 404s and the canvas stays blank.
setWorkerUrl("/maplibre-gl-worker.mjs?v=6.20.0");
import { frameTarget, mapPinCollection } from "@/domain/map-marks";
import { boundaryFeatureCollection, type CityZone } from "@/domain/map-zone";
import { VisitedAddress, type VisitedPlace } from "@/components/map/VisitedAddress";

type Pin = { id: string; lat: number; lng: number; title: string; visited: boolean; address?: string | null };

const PLANNED_DOT = "#8d95a8";

const LIGHT_STYLE = "https://tiles.openfreemap.org/styles/positron";
const DARK_STYLE = "https://tiles.openfreemap.org/styles/dark";

const NIGHT_FILL: Record<string, string> = {
  water: "#163044",
  landuse_park: "#52647c",
};
const NIGHT_LINE: Record<string, string> = {
  "boundary_country_z0-4": "#d5dee8",
  "boundary_country_z5-": "#d5dee8",
  boundary_state: "#9aabbd",
};
const NIGHT_TEXT: Record<string, string> = {
  place_country_major: "#f4f7fb",
  place_country_minor: "#e6edf5",
  place_country_other: "#d5dee8",
  place_state: "#c5d0dc",
  place_city: "#e8eef4",
  place_city_large: "#f4f7fb",
};

type StyleJson = { layers?: { id: string; paint?: Record<string, unknown> }[] };

function themeSnapshot(): { dark: boolean; accent: string } {
  const root = document.documentElement;
  const mode = root.dataset.theme;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || ((mode === "system" || !mode) && systemDark);
  const accent = getComputedStyle(root).getPropertyValue("--color-accent").trim() || "#5a5ac2";
  return { dark, accent };
}

let nightSource: Promise<StyleJson> | null = null;

function mapStyle(dark: boolean): Promise<string | StyleSpecification> {
  if (!dark) return Promise.resolve(LIGHT_STYLE);
  nightSource ??= fetch(DARK_STYLE)
    .then((response) => {
      if (!response.ok) throw new Error("style");
      return response.json() as Promise<StyleJson>;
    })
    .catch((error: unknown) => {
      nightSource = null;
      throw error;
    });
  return nightSource.then((raw) => {
    const style = structuredClone(raw);
    for (const layer of style.layers ?? []) {
      if (!layer.paint) continue;
      if (layer.id === "background") layer.paint["background-color"] = "#4a5b73";
      if (NIGHT_FILL[layer.id]) layer.paint["fill-color"] = NIGHT_FILL[layer.id];
      if (NIGHT_LINE[layer.id]) layer.paint["line-color"] = NIGHT_LINE[layer.id];
      if (NIGHT_TEXT[layer.id]) layer.paint["text-color"] = NIGHT_TEXT[layer.id];
    }
    return style as StyleSpecification;
  });
}

function paintZones(map: Map, zones: CityZone[], accent: string) {
  const data = boundaryFeatureCollection(zones);
  const fill: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 6, 0, 8.5, 0.55];
  const line: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 6, 0, 8.5, 1];
  const existing = map.getSource("zones");
  if (existing) {
    (existing as GeoJSONSource).setData(data);
    map.setPaintProperty("zones-fill", "fill-color", accent);
    map.setPaintProperty("zones-fill", "fill-opacity", fill);
    map.setPaintProperty("zones-line", "line-color", accent);
    map.setPaintProperty("zones-line", "line-opacity", line);
    return;
  }
  map.addSource("zones", { type: "geojson", data });
  map.addLayer({
    id: "zones-fill",
    type: "fill",
    source: "zones",
    paint: { "fill-color": accent, "fill-opacity": fill },
  });
  map.addLayer({
    id: "zones-line",
    type: "line",
    source: "zones",
    paint: { "line-color": accent, "line-width": 2.5, "line-opacity": line },
  });
}

function paintPins(map: Map, pins: Pin[], accent: string) {
  const data = mapPinCollection(pins.map((pin) => ({ ...pin, address: pin.address ?? null })));
  const color: ExpressionSpecification = ["case", ["==", ["get", "visited"], true], accent, PLANNED_DOT];
  const radius: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 2, 3, 6, 4.5, 11, 7];
  const existing = map.getSource("places");
  if (existing) {
    (existing as GeoJSONSource).setData(data);
    map.setPaintProperty("places-dot", "circle-color", color);
    map.setPaintProperty("places-dot", "circle-radius", radius);
    map.setPaintProperty("places-dot", "circle-stroke-width", 1.5);
    return;
  }
  map.addSource("places", { type: "geojson", data });
  map.addLayer({
    id: "places-dot",
    type: "circle",
    source: "places",
    paint: {
      "circle-radius": radius,
      "circle-color": color,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#f7f4ef",
    },
  });
  map.addLayer({
    id: "places-hit",
    type: "circle",
    source: "places",
    paint: { "circle-radius": 16, "circle-color": "#000000", "circle-opacity": 0 },
  });
}

function framePins(map: Map, pins: Pin[]) {
  const target = frameTarget(pins);
  if (target.kind === "empty") {
    map.jumpTo({ center: [-71.4, -35.4], zoom: 3.2 });
    return;
  }
  if (target.kind === "place") {
    map.jumpTo({ center: [target.lng, target.lat], zoom: target.zoom });
    return;
  }
  const bounds = new LngLatBounds();
  for (const pin of pins) bounds.extend([pin.lng, pin.lat]);
  map.fitBounds(bounds, { padding: 64, maxZoom: target.zoomCap, duration: 0 });
}

export function OutingMap({ pins, zones, onPick }: { pins: Pin[]; zones: CityZone[]; onPick?: (id: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const pick = useRef<(place: VisitedPlace) => void>(() => {});
  const pickId = useRef<((id: string) => void) | null>(null);
  pickId.current = onPick ?? null;
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<VisitedPlace | null>(null);
  pick.current = setPicked;
  const pinKey = pins.map((pin) => `${pin.id}:${pin.lat}:${pin.lng}:${pin.visited ? 1 : 0}:${pin.address ?? ""}`).join("|");
  const zoneKey = zones.map((zone) => zone.id).join("|");

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let cancelled = false;
    let map: Map | null = null;
    let dark = themeSnapshot().dark;
    let framed = false;
    let listening = false;
    let observerSize: ResizeObserver | null = null;

    void mapStyle(dark)
      .catch(() => LIGHT_STYLE)
      .then((style) => {
        if (cancelled) return;
        map = new Map({
          container: node,
          style,
          center: [-71.4, -35.4],
          zoom: 3.2,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
        map.addControl(new NavigationControl({ showCompass: false }), "top-right");
        const settle = () => map?.resize();
        const drawMarks = () => {
          if (!map) return;
          const accent = themeSnapshot().accent;
          paintZones(map, zones, accent);
          paintPins(map, pins, accent);
        };
        const listen = () => {
          if (!map || listening || !map.getLayer("places-hit")) return;
          listening = true;
          map.on("click", "places-hit", (event) => {
            const feature = event.features?.[0];
            if (!feature || feature.geometry.type !== "Point") return;
            const props = feature.properties ?? {};
            const [lng, lat] = feature.geometry.coordinates;
            const id = typeof props.id === "string" ? props.id : "";
            if (pickId.current && id) {
              pickId.current(id);
              return;
            }
            const raw = typeof props.address === "string" ? props.address.trim() : "";
            pick.current({
              title: typeof props.title === "string" && props.title.trim() ? props.title.trim() : "Lugar",
              address: raw || null,
              lat,
              lng,
            });
          });
          map.on("mouseenter", "places-hit", () => {
            map?.getCanvas().style.setProperty("cursor", "pointer");
          });
          map.on("mouseleave", "places-hit", () => {
            map?.getCanvas().style.removeProperty("cursor");
          });
        };
        map.on("style.load", () => {
          if (!map) return;
          try {
            drawMarks();
          } catch {
            // Tiles can be on screen while the style still rejects new layers. idle retries.
          }
          listen();
          map.once("idle", () => {
            if (!map) return;
            if (!map.getSource("places")) {
              try {
                drawMarks();
              } catch {
                // Tiles can finish before the style accepts the visited color.
              }
            }
            listen();
          });
          if (!framed) {
            framed = true;
            framePins(map, pins);
          }
          settle();
          setFailed(false);
        });
        observerSize = new ResizeObserver(settle);
        observerSize.observe(node);
        map.on("error", (event: { error?: unknown }) => {
          const message = event.error instanceof Error ? event.error.message : "";
          if (message.toLowerCase().includes("style")) setFailed(true);
        });
      });

    const applyTheme = () => {
      const next = themeSnapshot();
      if (!map) return;
      if (next.dark !== dark) {
        dark = next.dark;
        void mapStyle(next.dark)
          .catch(() => LIGHT_STYLE)
          .then((style) => {
            map?.setStyle(style);
          });
        return;
      }
      paintZones(map, zones, next.accent);
      paintPins(map, pins, next.accent);
    };
    const observer = new MutationObserver(applyTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-color", "class"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", applyTheme);

    return () => {
      cancelled = true;
      media.removeEventListener("change", applyTheme);
      observer.disconnect();
      observerSize?.disconnect();
      map?.remove();
    };
    // pinKey is the pin set for this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey, zoneKey]);

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="h-full w-full" />
      <VisitedAddress place={picked} onClose={() => setPicked(null)} />
      {failed ? (
        <p role="status" className="absolute inset-x-3 bottom-3 rounded-md bg-surface px-3 py-2 text-center text-small text-ink">
          No pudimos cargar el mapa. Inténtalo de nuevo.
        </p>
      ) : null}
    </div>
  );
}
