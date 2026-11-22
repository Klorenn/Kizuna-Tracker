import { periodsFor, type Period } from '@/domain/challenges'
import type { Frequency, LocalDate } from '@/domain/types'

type FrequencyRow = { frequency_type: string; target_per_week: number | null }
type ScheduleRow = FrequencyRow & { weeks: number; starts_on: string | null }

export function challengeFrequency(c: FrequencyRow): Frequency {
  return c.frequency_type === 'weekly'
    ? { type: 'weekly', target: c.target_per_week ?? 1 }
    : { type: 'daily' }
}

export function frequencyLabel(f: Frequency): string {
  return f.type === 'weekly' ? `${f.target} por semana` : 'Diario'
}

export type PeriodStatus =
  | { state: 'pending'; total: number }
  | { state: 'over'; total: number }
  | { state: 'running'; index: number; total: number; period: Period }

/** Where `today` sits in the challenge schedule. `index` is 1-based. */
export function periodStatus(c: ScheduleRow, today: LocalDate): PeriodStatus {
  const f = challengeFrequency(c)
  const total = f.type === 'daily' ? c.weeks * 7 : c.weeks
  if (!c.starts_on || today < c.starts_on) return { state: 'pending', total }
  const periods = periodsFor(c.starts_on, c.weeks, f)
  const i = periods.findIndex((p) => today >= p.start && today <= p.end)
  if (i === -1) return { state: 'over', total }
  return { state: 'running', index: i + 1, total, period: periods[i] }
}

/** Distinct check-in dates inside the period. */
export function countDone(period: Period, dates: LocalDate[]): number {
  return new Set(dates.filter((d) => d >= period.start && d <= period.end)).size
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** `YYYY-MM-DD` as "dom 29" (weekday + day). */
export function weekdayLabel(d: LocalDate): string {
  const [y, m, day] = d.split('-').map(Number)
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]} ${day}`
}

/** `YYYY-MM-DD` as "2 nov". */
export function dayMonthLabel(d: LocalDate): string {
  const [, m, day] = d.split('-').map(Number)
  return `${day} ${MONTHS[m - 1]}`
}

/** Last day of the challenge schedule. */
export function endsOn(c: ScheduleRow): LocalDate | null {
  if (!c.starts_on) return null
  const periods = periodsFor(c.starts_on, c.weeks, challengeFrequency(c))
  return periods[periods.length - 1].end
}

export const firstName = (displayName: string | null | undefined, fallback = 'Tu amigo') =>
  displayName?.trim().split(/\s+/)[0] || fallback
