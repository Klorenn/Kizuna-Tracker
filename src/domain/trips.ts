import type { LocalDate } from '@/domain/types'

const LINK_MAX = 500

/** Empty clears the link. Anything else must be an https URL without login credentials. */
export function parseTripLink(raw: string): { ok: true; link: string | null } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: true, link: null }
  if (trimmed.length > LINK_MAX) return { ok: false, error: 'Ese link es demasiado largo.' }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, error: 'Ese link no es válido. Tiene que empezar con https://.' }
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hostname.length === 0) {
    return { ok: false, error: 'Ese link no es válido. Tiene que empezar con https://.' }
  }
  return { ok: true, link: url.toString() }
}

export function tripLinkLabel(link: string): string {
  try {
    const host = new URL(link).hostname
    if (host === 'drive.google.com' || host === 'docs.google.com') return 'Abrir en Drive'
  } catch {
    // The stored value was already checked. A bad value still gets a plain label.
  }
  return 'Abrir link'
}

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
