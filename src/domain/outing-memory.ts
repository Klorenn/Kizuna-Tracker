import { tripSpan } from '@/domain/trips'
import type { LocalDate } from '@/domain/types'

export function bondStat(firstName: string, places: number): string | null {
  if (!Number.isInteger(places) || places < 1) return null
  const noun = places === 1 ? 'lugar' : 'lugares'
  return `Con ${firstName}: ${places} ${noun}`
}

export function distinctPlaces(
  rows: { placeKey: string; status: 'planned' | 'went'; companionId: string | null }[],
  companionId: string,
): number {
  const keys = new Set<string>()
  for (const row of rows) {
    if (row.status === 'went' && row.companionId === companionId) keys.add(row.placeKey)
  }
  return keys.size
}

/** The trip whose dates contain today. Two overlaps: the one that starts first. */
export function tripChipForToday(
  trips: { id: string; name: string; stops: { startsOn: LocalDate; endsOn: LocalDate }[] }[],
  today: LocalDate,
): { tripId: string; name: string } | null {
  const open = trips.flatMap((trip) => {
    const span = tripSpan(trip.stops)
    if (!span || today < span.startsOn || today > span.endsOn) return []
    return [{ trip, span }]
  })
  open.sort((a, b) => (a.span.startsOn < b.span.startsOn ? -1 : a.span.startsOn > b.span.startsOn ? 1 : 0))
  const hit = open[0]
  return hit ? { tripId: hit.trip.id, name: hit.trip.name } : null
}
