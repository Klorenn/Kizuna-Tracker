import { addDays, localDate, weekStart } from './dates'
import type { Frequency, LocalDate } from './types'

export type { Frequency }
export type Period = { start: LocalDate; end: LocalDate }

export const REJECT_WINDOW_MS = 24 * 60 * 60 * 1000

export function challengeStartDate(acceptedAt: Date, tz: string, frequency: Frequency): LocalDate {
  const today = localDate(acceptedAt, tz)
  return frequency.type === 'daily' ? addDays(today, 1) : addDays(weekStart(today), 7)
}

export function periodsFor(startsOn: LocalDate, weeks: number, frequency: Frequency): Period[] {
  if (frequency.type === 'daily') {
    return Array.from({ length: weeks * 7 }, (_, i) => {
      const day = addDays(startsOn, i)
      return { start: day, end: day }
    })
  }
  return Array.from({ length: weeks }, (_, i) => ({
    start: addDays(startsOn, i * 7),
    end: addDays(startsOn, i * 7 + 6),
  }))
}

function failed(period: Period, frequency: Frequency, dates: LocalDate[]): boolean {
  const inside = new Set(dates.filter((d) => d >= period.start && d <= period.end))
  return frequency.type === 'daily' ? !inside.has(period.start) : inside.size < frequency.target
}

export function evaluatePeriod(
  period: Period,
  frequency: Frequency,
  creatorDates: LocalDate[],
  rivalDates: LocalDate[],
): { creatorFailed: boolean; rivalFailed: boolean } {
  return {
    creatorFailed: failed(period, frequency, creatorDates),
    rivalFailed: failed(period, frequency, rivalDates),
  }
}

export function isPeriodClosable(
  period: Period,
  tz: string,
  now: Date,
  photoCheckinCreatedAts: Date[],
): boolean {
  if (localDate(now, tz) <= period.end) return false
  return !photoCheckinCreatedAts.some((c) => c.getTime() + REJECT_WINDOW_MS > now.getTime())
}

export function canReject(checkinCreatedAt: Date, now: Date): boolean {
  return checkinCreatedAt.getTime() + REJECT_WINDOW_MS > now.getTime()
}
