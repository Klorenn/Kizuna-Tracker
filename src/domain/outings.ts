import { addDays, localDate } from '@/domain/dates'
import type { LocalDate } from '@/domain/types'

const PLACE_KEY =
  /^(nominatim:(node|way|relation):[0-9]{1,20}|coord:-?[0-9]{1,3}[.][0-9]{5}:-?[0-9]{1,3}[.][0-9]{5})$/

export type PlacePick = {
  name: string
  detail: string | null
  placeKey: string
  lat: number
  lng: number
}

export function monthStartOf(d: LocalDate): LocalDate {
  return `${d.slice(0, 7)}-01`
}

export function monthEndOf(d: LocalDate): LocalDate {
  const start = monthStartOf(d)
  const [y, m] = start.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return addDays(next, -1)
}

export function currentMonthStart(instant: Date, timeZone: string): LocalDate {
  return monthStartOf(localDate(instant, timeZone))
}

export function datesInsideMonth(starts: LocalDate, ends: LocalDate, month: LocalDate): boolean {
  const start = monthStartOf(month)
  const end = monthEndOf(month)
  return starts >= start && starts <= end && ends >= start && ends <= end && starts <= ends
}

export function canMarkWent(today: LocalDate, startsOn: LocalDate, month: LocalDate): boolean {
  return today >= startsOn && today <= monthEndOf(month)
}

export function monthFloor(completed: number): { completed: number; floor: 1; met: boolean; label: string } {
  const n = Number.isInteger(completed) && completed >= 0 ? completed : 0
  return { completed: n, floor: 1, met: n >= 1, label: `${n} de 1` }
}

export function monthIndexLabel(monthStart: LocalDate, completed: number): string {
  return `${monthLabel(monthStart)} · ${monthFloor(completed).label}`
}

export function upcomingMonthStarts(today: LocalDate, count = 12): LocalDate[] {
  const months: LocalDate[] = []
  let cursor = monthStartOf(today)
  for (let i = 0; i < count; i++) {
    months.push(cursor)
    cursor = shiftMonth(cursor)
  }
  return months
}

export function cleanGuestName(raw: string): { ok: true; name: string | null } | { ok: false; error: string } {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (!name) return { ok: true, name: null }
  if (name.length > 40) return { ok: false, error: 'Ese nombre puede tener hasta 40 caracteres.' }
  return { ok: true, name }
}

export function planLine(placeName: string, withName: string | null): string {
  const name = withName?.trim()
  return name ? `${placeName} · con ${name}` : placeName
}

export function shiftMonth(day: LocalDate): LocalDate {
  const [y, m, d] = day.split('-').map(Number)
  const nextYear = m === 12 ? y + 1 : y
  const nextMonth = m === 12 ? 1 : m + 1
  const nextStart = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01` as LocalDate
  const last = Number(monthEndOf(nextStart).slice(8, 10))
  const dayNum = Math.min(d, last)
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
}

export function visitCounts(
  pins: { placeKey: string; placeName: string }[],
): Map<string, { placeName: string; times: number }> {
  const out = new Map<string, { placeName: string; times: number }>()
  for (const pin of pins) {
    const prev = out.get(pin.placeKey)
    if (!prev) out.set(pin.placeKey, { placeName: pin.placeName, times: 1 })
    else prev.times += 1
  }
  return out
}

export function visitLabel(placeName: string, times: number): string {
  return `${placeName} · ${times} ${times === 1 ? 'vez' : 'veces'}`
}

export function monthLabel(monthStart: LocalDate): string {
  const [y, m, day] = monthStart.split('-').map(Number)
  const name = new Intl.DateTimeFormat('es-CL', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, day)),
  )
  return name.charAt(0).toLocaleUpperCase('es-CL') + name.slice(1)
}

export function outingTitle(
  placeName: string,
  companion: { name: string; status: 'pending' | 'accepted' } | null,
): string {
  if (companion?.status === 'accepted') return `${placeName}, con ${companion.name}`
  return placeName
}

export function coordPlaceKey(lat: number, lng: number): string {
  return `coord:${lat.toFixed(5)}:${lng.toFixed(5)}`
}

export function isPlaceKey(value: string): boolean {
  return PLACE_KEY.test(value)
}

export function validateOutingDraft(input: {
  place: PlacePick | null
  startsOn: string
  endsOn: string
  note: string
  month: LocalDate
}): { ok: true } | { ok: false; field: 'place' | 'dates' | 'note'; error: string } {
  const name = input.place?.name.trim() ?? ''
  if (
    !input.place ||
    name.length < 1 ||
    name.length > 80 ||
    !isPlaceKey(input.place.placeKey) ||
    !Number.isFinite(input.place.lat) ||
    !Number.isFinite(input.place.lng) ||
    input.place.lat < -90 ||
    input.place.lat > 90 ||
    input.place.lng < -180 ||
    input.place.lng > 180
  ) {
    return { ok: false, field: 'place', error: 'No encontramos ese lugar.' }
  }
  if (!datesInsideMonth(input.startsOn, input.endsOn, input.month)) {
    return { ok: false, field: 'dates', error: 'Esas fechas no caben en este mes.' }
  }
  const note = input.note.trim()
  if (note.length > 280) {
    return { ok: false, field: 'note', error: 'La nota puede tener hasta 280 caracteres.' }
  }
  return { ok: true }
}

export function monthRowValue(read: { ok: true; completed: number } | { ok: false }): string | null {
  if (!read.ok) return null
  return monthFloor(read.completed).label
}

export function mapScreen(input: {
  monthOk: boolean
  mapOk: boolean
  completed: number
  outingCount: number
  pinCount: number
}): { kind: 'error' } | { kind: 'empty'; floorLabel: string } | { kind: 'ready'; floorLabel: string; showMonthEmptyCopy: boolean } {
  if (!input.monthOk || !input.mapOk) return { kind: 'error' }
  const floorLabel = monthFloor(input.completed).label
  if (input.outingCount === 0 && input.pinCount === 0) return { kind: 'empty', floorLabel }
  return { kind: 'ready', floorLabel, showMonthEmptyCopy: input.outingCount === 0 }
}
