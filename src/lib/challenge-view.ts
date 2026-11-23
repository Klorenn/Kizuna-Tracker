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

export type HistoryDebt = { period_start: string; debtor_id: string; amount: number; paid_at: string | null }

export type FailureRow = {
  start: LocalDate
  /** 1-based position in the schedule */
  n: number
  summary: string
  /** Only when exactly one player failed: what is owed for this period. */
  debt: { amount: number; paid: boolean } | null
}

/**
 * "Historial de fallas" for closed periods, built from the ledger: a debt row for a player means
 * that player failed the period, none means both met it. Debts are readable by both players for
 * good, while the rival's check-ins disappear with the friendship (unfriend, account deletion),
 * so counts are decoration only: shown while visible (`theirDates` is null when hidden) and
 * consistent with the debt. Periods with a debt but no closed row (a crash in between) are kept.
 */
export function failureHistory(args: {
  periods: Period[]
  closedStarts: Iterable<LocalDate>
  debts: HistoryDebt[]
  myId: string
  otherName: string
  frequency: Frequency
  myDates: LocalDate[]
  theirDates: LocalDate[] | null
  limit?: number
}): FailureRow[] {
  const { periods, debts, myId, otherName, frequency, myDates, theirDates, limit = 12 } = args
  const shown = new Set([...args.closedStarts, ...debts.map((d) => d.period_start)])
  const need = frequency.type === 'weekly' ? frequency.target : 1
  const counted = (p: Period, dates: LocalDate[] | null) => {
    if (frequency.type !== 'weekly' || dates === null) return null
    const done = countDone(p, dates)
    return done < need ? done : null
  }

  return periods
    .map((p, i) => ({ p, n: i + 1 }))
    .filter(({ p }) => shown.has(p.start))
    .reverse()
    .slice(0, limit)
    .map(({ p, n }): FailureRow => {
      const mine = debts.find((d) => d.period_start === p.start && d.debtor_id === myId)
      const theirs = debts.find((d) => d.period_start === p.start && d.debtor_id !== myId)
      const owed = mine ?? theirs
      if (!owed) return { start: p.start, n, summary: 'Los dos cumplieron', debt: null }
      if (mine && theirs) return { start: p.start, n, summary: 'Fallaron los dos · se compensa', debt: null }
      const done = counted(p, mine ? myDates : theirDates)
      const summary = mine
        ? done === null
          ? 'No cumpliste'
          : `Hiciste ${done} de ${need}`
        : done === null
          ? `${otherName} no cumplió`
          : `${otherName} hizo ${done} de ${need}`
      return { start: p.start, n, summary, debt: { amount: owed.amount, paid: owed.paid_at !== null } }
    })
}

/** Why a challenge was cancelled, when the data says so. */
export function cancelledLabel(c: { starts_on: string | null; cancel_requested_by: string | null }): string {
  if (c.cancel_requested_by) return 'Cancelado entre los dos'
  if (!c.starts_on) return 'Propuesta retirada'
  return 'Cancelado'
}
