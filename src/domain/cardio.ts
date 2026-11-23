import { monthOf, type MonthKey } from './calendar'
import { formatHms } from './time'
import type { LocalDate } from './types'

// Distance activities: how far and how fast you ran, walked, cycled or swam. Pure functions,
// no I/O. Distance is stored in metres and time in seconds.

type Result = { ok: true } | { ok: false; error: string }
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

export type CardioKind = 'run' | 'walk' | 'bike' | 'swim' | 'other'
export const CARDIO_KINDS: readonly CardioKind[] = ['run', 'walk', 'bike', 'swim', 'other']
export const CARDIO_KIND_LABEL: Readonly<Record<CardioKind, string>> = {
  run: 'Trote',
  walk: 'Caminata',
  bike: 'Bicicleta',
  swim: 'Natación',
  other: 'Otro',
}
export const CARDIO_QUESTION: Readonly<Record<CardioKind, string>> = {
  run: '¿Cuánto trotaste hoy?',
  walk: '¿Cuánto caminaste hoy?',
  bike: '¿Cuánto pedaleaste hoy?',
  swim: '¿Cuánto nadaste hoy?',
  other: '¿Cuánto avanzaste hoy?',
}

export const MAX_DISTANCE_M = 500000
export const MAX_DURATION_S = 86400
/** Pace only counts for outings of at least one kilometre. */
const MIN_PACE_DISTANCE_M = 1000

export type CardioEntry = { id: string; date: LocalDate; kind: CardioKind; distanceM: number; durationS: number }

/** Seconds per kilometre, rounded. */
export const paceSeconds = (distanceM: number, durationS: number): number => Math.round((durationS * 1000) / distanceM)

/** "5:42 /km". */
export function formatPace(sec: number): string {
  const total = Math.round(sec)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} /km`
}

/** km/h with one decimal. */
export const speedKmh = (distanceM: number, durationS: number): number =>
  Math.round((distanceM / durationS) * 3.6 * 10) / 10

/** 1.500 / 5,2: es-CL separators without ICU, at most `decimals` decimals. */
function num(n: number, decimals: number): string {
  const f = 10 ** decimals
  const [int, frac = ''] = (Math.round(n * f) / f).toFixed(decimals).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const rest = frac.replace(/0+$/, '')
  return rest ? `${grouped},${rest}` : grouped
}

/** Swimming is written in metres ("1.500 m"); everything else in kilometres ("5,2 km"). */
export function formatDistance(m: number, kind: CardioKind): string {
  return kind === 'swim' ? `${num(m, 0)} m` : `${num(m / 1000, 2)} km`
}

/** What the user typed (comma or point) in the unit of the activity, as metres; null if invalid. */
export function parseDistance(raw: string, kind: CardioKind): number | null {
  const s = raw.trim().replace(',', '.')
  if (kind === 'swim') {
    if (!/^\d+$/.test(s)) return null
    const m = Number(s)
    return m >= 1 && m <= MAX_DISTANCE_M ? m : null
  }
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null
  const m = Math.round(Number(s) * 1000)
  return m >= 1 && m <= MAX_DISTANCE_M ? m : null
}

/** Hours, minutes and seconds from three text fields (any may be empty): 1 s to 24 h, else null. */
export function parseHms(h: string, m: string, s: string): number | null {
  const [hs, ms, ss] = [h.trim(), m.trim(), s.trim()]
  if ([hs, ms, ss].some((v) => v !== '' && !/^\d{1,5}$/.test(v))) return null
  const [hh, mm, sc] = [hs, ms, ss].map((v) => (v === '' ? 0 : Number(v)))
  if (mm > 59 || sc > 59) return null
  const total = hh * 3600 + mm * 60 + sc
  return total >= 1 && total <= MAX_DURATION_S ? total : null
}

export function validateCardioInput(i: { kind: CardioKind; distanceM: number | null; durationS: number | null }): Result {
  if (!CARDIO_KINDS.includes(i.kind)) return fail('Elige la actividad.')
  if (i.distanceM === null) return fail('Escribe la distancia.')
  if (!Number.isInteger(i.distanceM) || i.distanceM < 1 || i.distanceM > MAX_DISTANCE_M) {
    return fail('La distancia va hasta 500 km.')
  }
  if (i.durationS === null) return fail('Escribe el tiempo.')
  if (!Number.isInteger(i.durationS) || i.durationS < 1 || i.durationS > MAX_DURATION_S) {
    return fail('El tiempo va hasta 24 horas.')
  }
  return { ok: true }
}

export function monthlyCardio(
  entries: CardioEntry[],
  month: MonthKey,
): {
  month: MonthKey
  distanceM: number
  durationS: number
  outings: number
  longestM: number
  bestPace: number | null
  averageM: number
} {
  const inMonth = entries.filter((e) => monthOf(e.date) === month)
  const distanceM = inMonth.reduce((sum, e) => sum + e.distanceM, 0)
  const paces = inMonth.filter((e) => e.distanceM >= MIN_PACE_DISTANCE_M).map((e) => paceSeconds(e.distanceM, e.durationS))
  return {
    month,
    distanceM,
    durationS: inMonth.reduce((sum, e) => sum + e.durationS, 0),
    outings: inMonth.length,
    longestM: inMonth.reduce((max, e) => Math.max(max, e.distanceM), 0),
    bestPace: paces.length === 0 ? null : Math.min(...paces),
    averageM: inMonth.length === 0 ? 0 : Math.round(distanceM / inMonth.length),
  }
}

export function cardioSeries(entries: CardioEntry[], months: MonthKey[]): { month: MonthKey; distanceM: number }[] {
  return months.map((month) => ({ month, distanceM: monthlyCardio(entries, month).distanceM }))
}

/** One point per run of at least one kilometre, oldest first. */
export function paceTrend(entries: CardioEntry[]): { date: LocalDate; pace: number }[] {
  return entries
    .filter((e) => e.kind === 'run' && e.distanceM >= MIN_PACE_DISTANCE_M)
    .map((e, i) => ({ date: e.date, pace: paceSeconds(e.distanceM, e.durationS), i }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.i - b.i)
    .map(({ date, pace }) => ({ date, pace }))
}

/** The Hoy subtitle of cardio outings: "5,2 km · 29:40 · 5:42 /km" or "5,5 km · 48:00 · 2 salidas". */
export function cardioSummary(entries: { distanceM: number; durationS: number; kind: CardioKind }[]): string {
  if (entries.length === 0) return ''
  const distanceM = entries.reduce((sum, e) => sum + e.distanceM, 0)
  const durationS = entries.reduce((sum, e) => sum + e.durationS, 0)
  const kind: CardioKind = entries.every((e) => e.kind === entries[0].kind) ? entries[0].kind : 'run'
  const parts = [formatDistance(distanceM, kind), formatHms(durationS)]
  if (entries.length > 1) parts.push(`${entries.length} salidas`)
  else if (kind !== 'swim') parts.push(formatPace(paceSeconds(distanceM, durationS)))
  return parts.join(' · ')
}
