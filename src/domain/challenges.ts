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

/** One sub-reto (a row of challenge_items) as the cron sees it: only active items reach the domain. */
export type ChallengeItemSpec = {
  id: string
  creatorHabitId: string
  rivalHabitId: string
  /** The challenge's period unit with this item's own weekly target. */
  frequency: Frequency
  /** Only non-rejected photo check-ins count for this item. */
  requiresPhoto: boolean
  /** The item counts only from the period that starts on or after this date. */
  startsOn: LocalDate
}

export type ItemResult = { itemId: string; side: 'creator' | 'rival'; met: boolean; done: number; needed: number }

/** An item added mid-challenge does not count in periods that started before its own start. */
export function itemAppliesTo(item: ChallengeItemSpec, period: Period): boolean {
  return item.startsOn <= period.start
}

/**
 * Evaluates every item that applies to the period, per player. A player fails the period if they miss ANY applicable
 * item; with no applicable item nobody fails. `results` holds one row per applicable item and side (done/needed are
 * stored so history survives later check-in deletions).
 */
export function evaluateItems(
  period: Period,
  items: ChallengeItemSpec[],
  datesByItem: Map<string, { creator: LocalDate[]; rival: LocalDate[] }>,
): { creatorFailed: boolean; rivalFailed: boolean; results: ItemResult[] } {
  const results: ItemResult[] = []
  let creatorFailed = false
  let rivalFailed = false
  for (const item of items) {
    if (!itemAppliesTo(item, period)) continue
    const d = datesByItem.get(item.id) ?? { creator: [], rival: [] }
    const needed = item.frequency.type === 'daily' ? 1 : item.frequency.target
    for (const side of ['creator', 'rival'] as const) {
      const done = new Set(d[side].filter((x) => x >= period.start && x <= period.end)).size
      const met = !failed(period, item.frequency, d[side])
      results.push({ itemId: item.id, side, met, done, needed })
      if (!met) {
        if (side === 'creator') creatorFailed = true
        else rivalFailed = true
      }
    }
  }
  return { creatorFailed, rivalFailed, results }
}

function daysBetween(from: LocalDate, to: LocalDate): number {
  const t = (d: LocalDate) => {
    const [y, m, day] = d.split('-').map(Number)
    return Date.UTC(y, m - 1, day)
  }
  return Math.round((t(to) - t(from)) / 86_400_000)
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
