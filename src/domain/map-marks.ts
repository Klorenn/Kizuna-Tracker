export type MapMark = {
  id: string
  lat: number
  lng: number
  title: string
  visited: boolean
}

export function mapMarks(input: {
  visited: { id: string; lat: number; lng: number; title: string }[]
  planned: { id: string; lat: number; lng: number; title: string }[]
}): MapMark[] {
  const seen = new Set<string>()
  const marks: MapMark[] = []
  for (const row of input.visited) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    marks.push({ ...row, visited: true })
  }
  for (const row of input.planned) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    marks.push({ ...row, visited: false })
  }
  return marks
}

export function mapPinCollection(marks: readonly MapMark[]) {
  return {
    type: "FeatureCollection" as const,
    features: marks.map((mark) => ({
      type: "Feature" as const,
      properties: { visited: mark.visited, title: mark.title },
      geometry: { type: "Point" as const, coordinates: [mark.lng, mark.lat] as [number, number] },
    })),
  }
}
