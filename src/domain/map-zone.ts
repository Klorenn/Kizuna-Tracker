export type LngLat = [number, number]
export type ZonePolygon = LngLat[][]

export type CityZone = { id: string; polygons: ZonePolygon[] }

export function polygonsFromGeoJson(geojson: unknown): ZonePolygon[] {
  if (!geojson || typeof geojson !== "object") return []
  const row = geojson as { type?: unknown; coordinates?: unknown }
  if (row.type === "Polygon") {
    const polygon = polygonRings(row.coordinates)
    return polygon ? [polygon] : []
  }
  if (row.type === "MultiPolygon" && Array.isArray(row.coordinates)) {
    return row.coordinates.flatMap((part) => {
      const polygon = polygonRings(part)
      return polygon ? [polygon] : []
    })
  }
  return []
}

export function outlineSpanKm(polygons: readonly ZonePolygon[]): number {
  let minLat = 90
  let maxLat = -90
  let minLng = 180
  let maxLng = -180
  for (const polygon of polygons) {
    for (const point of polygon[0] ?? []) {
      minLng = Math.min(minLng, point[0])
      maxLng = Math.max(maxLng, point[0])
      minLat = Math.min(minLat, point[1])
      maxLat = Math.max(maxLat, point[1])
    }
  }
  if (minLat > maxLat) return 0
  return kilometers(minLat, minLng, maxLat, maxLng)
}

export function boundaryFeatureCollection(zones: readonly CityZone[]) {
  return {
    type: "FeatureCollection" as const,
    features: zones.flatMap((zone) =>
      zone.polygons.map((rings) => ({
        type: "Feature" as const,
        properties: { id: zone.id },
        geometry: { type: "Polygon" as const, coordinates: rings },
      })),
    ),
  }
}

function polygonRings(coordinates: unknown): ZonePolygon | null {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null
  const rings: LngLat[][] = []
  for (const raw of coordinates) {
    const next = closeRing(raw)
    if (!next) return null
    rings.push(next)
  }
  return rings
}

function closeRing(value: unknown): LngLat[] | null {
  if (!Array.isArray(value) || value.length < 4) return null
  const points: LngLat[] = []
  for (const point of value) {
    if (!Array.isArray(point) || point.length < 2) return null
    const lng = point[0]
    const lat = point[1]
    if (typeof lng !== "number" || typeof lat !== "number") return null
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
    points.push([lng, lat])
  }
  const first = points[0]
  const last = points[points.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) points.push([first[0], first[1]])
  return points.length >= 4 ? points : null
}

function kilometers(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const lat1 = (aLat * Math.PI) / 180
  const lat2 = (bLat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}
