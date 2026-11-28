export type MapMark = {
  id: string
  lat: number
  lng: number
  title: string
  visited: boolean
  address: string | null
}

export function mapMarks(input: {
  visited: { id: string; lat: number; lng: number; title: string; address?: string | null }[]
  planned: { id: string; lat: number; lng: number; title: string }[]
}): MapMark[] {
  const seen = new Set<string>()
  const marks: MapMark[] = []
  for (const row of input.visited) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    marks.push({ id: row.id, lat: row.lat, lng: row.lng, title: row.title, visited: true, address: row.address?.trim() || null })
  }
  for (const row of input.planned) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    marks.push({ id: row.id, lat: row.lat, lng: row.lng, title: row.title, visited: false, address: null })
  }
  return marks
}

export function mapPinCollection(marks: readonly MapMark[]) {
  return {
    type: "FeatureCollection" as const,
    features: marks.map((mark) => ({
      type: "Feature" as const,
      properties: { visited: mark.visited, title: mark.title, address: mark.address ?? "" },
      geometry: { type: "Point" as const, coordinates: [mark.lng, mark.lat] as [number, number] },
    })),
  }
}
