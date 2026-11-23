import { addDays } from './dates'
import type { LocalDate } from './types'

/** Calendar month as `YYYY-MM` (the `?mes=` URL value). */
export type MonthKey = string

export type GridDay = { date: LocalDate; inMonth: boolean }

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
/** Monday first, like every week in the app. */
export const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const pad = (n: number) => String(n).padStart(2, '0')

export const monthOf = (date: LocalDate): MonthKey => date.slice(0, 7)

export function shiftMonth(month: MonthKey, n: number): MonthKey {
  const idx = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`
}

export function monthBounds(month: MonthKey): { first: LocalDate; last: LocalDate } {
  const [y, m] = month.split('-').map(Number)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { first: `${month}-01`, last: `${month}-${pad(days)}` }
}

/** 0 = Monday ... 6 = Sunday. */
function weekdayIndex(date: LocalDate): number {
  const [y, m, d] = date.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

/**
 * Whole Monday-to-Sunday weeks covering the month: leading days of the previous month and
 * trailing days of the next one are included (and flagged) so every row has 7 cells.
 */
export function monthGrid(month: MonthKey): GridDay[][] {
  const { first, last } = monthBounds(month)
  const start = addDays(first, -weekdayIndex(first))
  const end = addDays(last, 6 - weekdayIndex(last))
  const weeks: GridDay[][] = []
  for (let cursor = start; cursor <= end; ) {
    const week: GridDay[] = []
    for (let i = 0; i < 7; i++) {
      week.push({ date: cursor, inMonth: cursor.startsWith(month) })
      cursor = addDays(cursor, 1)
    }
    weeks.push(week)
  }
  return weeks
}

/**
 * `?mes=` value to a month the calendar can show: malformed or missing means the current
 * month; anything after it or before `earliest` is clamped.
 */
export function parseMonthParam(
  raw: string | string[] | undefined | null,
  bounds: { current: MonthKey; earliest: MonthKey },
): MonthKey {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || !MONTH_RE.test(value)) return bounds.current
  if (value > bounds.current) return bounds.current
  if (value < bounds.earliest) return bounds.earliest > bounds.current ? bounds.current : bounds.earliest
  return value
}

/** Oldest month among the candidate dates (first check-in, habit creation), never after `current`. */
export function earliestMonth(candidates: (LocalDate | null | undefined)[], current: MonthKey): MonthKey {
  let min = current
  for (const c of candidates) {
    if (!c) continue
    const m = monthOf(c)
    if (m < min) min = m
  }
  return min
}

export function monthNav(
  month: MonthKey,
  bounds: { current: MonthKey; earliest: MonthKey },
): { prev: MonthKey | null; next: MonthKey | null; isCurrent: boolean } {
  return {
    prev: month > bounds.earliest ? shiftMonth(month, -1) : null,
    next: month < bounds.current ? shiftMonth(month, 1) : null,
    isCurrent: month === bounds.current,
  }
}

/** The last `max` months up to `current` (newest first), never before `earliest`. */
export function recentMonths(current: MonthKey, earliest: MonthKey, max: number): MonthKey[] {
  const out: MonthKey[] = []
  for (let m = current; out.length < max && m >= earliest; m = shiftMonth(m, -1)) out.push(m)
  return out
}

/** "Noviembre" + "2026": the year is rendered apart (mono). */
export function monthTitle(month: MonthKey): { name: string; year: string } {
  return { name: capitalize(MONTH_NAMES[Number(month.slice(5, 7)) - 1]), year: month.slice(0, 4) }
}

/** "23 de noviembre". */
export function dayLabel(date: LocalDate): string {
  return `${Number(date.slice(8, 10))} de ${MONTH_NAMES[Number(date.slice(5, 7)) - 1]}`
}

/** "Lunes 23 de noviembre", with " de 2025" when it is not this year. */
export function dayHeading(date: LocalDate, today: LocalDate): string {
  const year = date.slice(0, 4) === today.slice(0, 4) ? '' : ` de ${date.slice(0, 4)}`
  return `${capitalize(WEEKDAY_NAMES[weekdayIndex(date)])} ${dayLabel(date)}${year}`
}

/** Path plus the non-empty params, in the given order. */
export function withSearch(path: string, params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `${path}?${s}` : path
}
