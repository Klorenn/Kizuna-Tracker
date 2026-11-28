import { outlineSpanKm, polygonsFromGeoJson, type ZonePolygon } from "@/domain/map-zone";
import { coordPlaceKey, isPlaceKey, type PlacePick } from "@/domain/outings";

const USER_AGENT = "Kizuna/0.1 (place search)";
const PLACE_KEY_KIND: Record<string, "node" | "way" | "relation"> = {
  node: "node",
  way: "way",
  relation: "relation",
  N: "node",
  W: "way",
  R: "relation",
};

export class PlaceSearchError extends Error {
  constructor() {
    super("place_search_failed");
    this.name = "PlaceSearchError";
  }
}

export async function searchPlaces(query: string, fetchImpl: typeof fetch = fetch): Promise<PlacePick[]> {
  const q = query.trim();
  if (q.length < 3 || q.length > 80) return [];
  const nominatim = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=cl&q=${encodeURIComponent(q)}`;
  let fromNominatim: PlacePick[] = [];
  let nominatimDown = false;
  try {
    const response = await fetchImpl(nominatim, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "es" },
    });
    if (response.status === 429 || response.status >= 500) nominatimDown = true;
    else if (!response.ok) throw new PlaceSearchError();
    else {
      const body: unknown = await response.json();
      if (!Array.isArray(body)) throw new PlaceSearchError();
      fromNominatim = body.flatMap((hit) => nominatimPlace(hit) ?? []);
    }
  } catch (error) {
    if (error instanceof PlaceSearchError) throw error;
    nominatimDown = true;
  }
  if (!nominatimDown && fromNominatim.length >= 5) return fromNominatim;
  try {
    return mergePlaces(fromNominatim, await searchPhoton(q, fetchImpl));
  } catch (error) {
    if (nominatimDown) throw error instanceof PlaceSearchError ? error : new PlaceSearchError();
    return fromNominatim;
  }
}

export type CityOutline = { id: string; polygons: ZonePolygon[] };

const CITY_ZOOMS = [10, 12];

/** The commune that contains the point, as its real outline. */
/** Address of a place we already saved. Uses that place's coordinates, never the phone. */
export async function addressAt(lat: number, lng: number, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`;
  try {
    const response = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "es" } });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") return null;
    const display = (body as { display_name?: unknown }).display_name;
    if (typeof display !== "string") return null;
    const line = display.trim().slice(0, 180);
    return line || null;
  } catch {
    return null;
  }
}

export async function cityOutline(lat: number, lng: number, fetchImpl: typeof fetch = fetch): Promise<CityOutline | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  for (const zoom of CITY_ZOOMS) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&polygon_geojson=1&polygon_threshold=0.001&zoom=${zoom}&lat=${lat}&lon=${lng}`;
      const response = await fetchImpl(url, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "es" },
        next: { revalidate: 2_592_000 },
      });
      if (!response.ok) continue;
      const outline = outlineFromReverse(await response.json());
      if (outline) return outline;
    } catch {
      return null;
    }
  }
  return null;
}

export async function cityZones(
  pins: readonly { lat: number; lng: number }[],
  fetchImpl: typeof fetch = fetch,
): Promise<CityOutline[]> {
  const seen = new Set<string>();
  const zones: CityOutline[] = [];
  for (const pin of pins) {
    const outline = await cityOutline(pin.lat, pin.lng, fetchImpl);
    if (!outline || seen.has(outline.id)) continue;
    seen.add(outline.id);
    zones.push(outline);
  }
  return zones;
}

function outlineFromReverse(body: unknown): CityOutline | null {
  if (!body || typeof body !== "object") return null;
  const row = body as Record<string, unknown>;
  const polygons = polygonsFromGeoJson(row.geojson);
  const span = outlineSpanKm(polygons);
  if (polygons.length === 0 || span < 0.8 || span > 80) return null;
  const osmType = typeof row.osm_type === "string" ? row.osm_type : "x";
  const osmId = typeof row.osm_id === "number" || typeof row.osm_id === "string" ? String(row.osm_id) : "0";
  return { id: `${osmType}:${osmId}`, polygons };
}

export async function placeSearchResponse(
  session: { userId: string } | null,
  query: string | null,
  search: (q: string) => Promise<PlacePick[]>,
): Promise<{ status: number; body: { places: PlacePick[] } | { error: string } }> {
  if (!session?.userId) return { status: 401, body: { error: "not_authenticated" } };
  try {
    const places = await search(query ?? "");
    return { status: 200, body: { places } };
  } catch (error) {
    if (error instanceof PlaceSearchError) {
      return { status: 502, body: { error: "No pudimos buscar lugares. Inténtalo de nuevo." } };
    }
    throw error;
  }
}

async function searchPhoton(query: string, fetchImpl: typeof fetch): Promise<PlacePick[]> {
  const url = `https://photon.komoot.io/api/?limit=6&lang=default&lat=-35.6751&lon=-71.5430&q=${encodeURIComponent(query)}`;
  try {
    const response = await fetchImpl(url, { headers: { "Accept-Language": "es" } });
    if (!response.ok) throw new PlaceSearchError();
    const body: unknown = await response.json();
    const features =
      body && typeof body === "object" && Array.isArray((body as { features?: unknown }).features)
        ? (body as { features: unknown[] }).features
        : null;
    if (!features) throw new PlaceSearchError();
    return features.flatMap((feature) => photonPlace(feature) ?? []);
  } catch (error) {
    if (error instanceof PlaceSearchError) throw error;
    throw new PlaceSearchError();
  }
}

function nominatimPlace(hit: unknown): PlacePick | null {
  if (!hit || typeof hit !== "object") return null;
  const row = hit as Record<string, unknown>;
  const names = placeNames(row.name, row.display_name);
  if (!names) return null;
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  const key = osmPlaceKey(row.osm_type, row.osm_id) ?? (Number.isFinite(lat) && Number.isFinite(lng) ? coordPlaceKey(lat, lng) : null);
  if (!key) return null;
  return finishPlace(names.name, names.detail, key, lat, lng);
}

function photonPlace(feature: unknown): PlacePick | null {
  if (!feature || typeof feature !== "object") return null;
  const row = feature as {
    geometry?: { coordinates?: unknown };
    properties?: Record<string, unknown>;
  };
  if (row.properties?.countrycode !== "CL") return null;
  const coordinates = row.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  const names = placeNames(row.properties.name, row.properties.name);
  if (!names) return null;
  names.detail = photonDetail(row.properties);
  const key =
    osmPlaceKey(row.properties.osm_type, row.properties.osm_id) ??
    (Number.isFinite(lat) && Number.isFinite(lng) ? coordPlaceKey(lat, lng) : null);
  if (!key) return null;
  return finishPlace(names.name, names.detail, key, lat, lng);
}

function placeNames(name: unknown, displayName: unknown): { name: string; detail: string | null } | null {
  const display = typeof displayName === "string" ? displayName : "";
  const parts = display.split(",");
  const explicit = typeof name === "string" ? name.trim() : "";
  const placeName = (explicit || parts[0]?.trim() || "").slice(0, 80);
  if (!placeName) return null;
  const rest = parts.slice(1).join(",").trim().slice(0, 120);
  return { name: placeName, detail: rest || null };
}

const PHOTON_KIND: Record<string, string> = {
  city: "Ciudad",
  town: "Pueblo",
  village: "Pueblo",
  municipality: "Comuna",
  station: "Estación",
  halt: "Estación",
  suburb: "Sector",
  neighbourhood: "Barrio",
  residential: "Calle",
  living_street: "Calle",
  hamlet: "Localidad",
};

function photonDetail(props: Record<string, unknown>): string | null {
  const kind = typeof props.osm_value === "string" ? PHOTON_KIND[props.osm_value] : "";
  const region = typeof props.state === "string" ? props.state.trim() : "";
  const detail = [kind, region].filter(Boolean).join(" · ").slice(0, 120);
  return detail || null;
}

function mergePlaces(primary: PlacePick[], extra: PlacePick[]): PlacePick[] {
  const merged = [...primary];
  for (const place of extra) {
    const duplicate = merged.some(
      (current) =>
        current.placeKey === place.placeKey ||
        (current.name.localeCompare(place.name, "es", { sensitivity: "base" }) === 0 &&
          kilometers(current.lat, current.lng, place.lat, place.lng) < 0.4),
    );
    if (!duplicate) merged.push(place);
  }
  return merged.slice(0, 6);
}

function kilometers(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function osmPlaceKey(type: unknown, id: unknown): string | null {
  if (typeof type !== "string") return null;
  const kind = PLACE_KEY_KIND[type];
  if (!kind) return null;
  const raw = typeof id === "number" && Number.isInteger(id) ? String(id) : typeof id === "string" ? id : "";
  if (!/^[0-9]{1,20}$/.test(raw)) return null;
  const key = `nominatim:${kind}:${raw}`;
  return isPlaceKey(key) ? key : null;
}

function finishPlace(name: string, detail: string | null, placeKey: string, lat: number, lng: number): PlacePick | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (!isPlaceKey(placeKey)) return null;
  return { name, detail, placeKey, lat, lng };
}
