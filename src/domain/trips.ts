import type { LocalDate } from '@/domain/types'

/** Earliest start and latest end. Empty list has no span. */
export function tripSpan(stops: { startsOn: LocalDate; endsOn: LocalDate }[]): { startsOn: LocalDate; endsOn: LocalDate } | null {
  if (stops.length === 0) return null
  let startsOn = stops[0].startsOn
  let endsOn = stops[0].endsOn
  for (const stop of stops) {
    if (stop.startsOn < startsOn) startsOn = stop.startsOn
    if (stop.endsOn > endsOn) endsOn = stop.endsOn
  }
  return { startsOn, endsOn }
}
