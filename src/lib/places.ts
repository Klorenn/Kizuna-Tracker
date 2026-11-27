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
  try {
    const response = await fetchImpl(nominatim, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "es" },
    });
    if (response.status === 429 || response.status >= 500) return searchPhoton(q, fetchImpl);
    if (!response.ok) throw new PlaceSearchError();
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new PlaceSearchError();
    return body.flatMap((hit) => nominatimPlace(hit) ?? []);
  } catch (error) {
    if (error instanceof PlaceSearchError) throw error;
    return searchPhoton(q, fetchImpl);
  }
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
  const url = `https://photon.komoot.io/api/?limit=5&lang=es&lat=-35.6751&lon=-71.5430&q=${encodeURIComponent(query)}`;
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
