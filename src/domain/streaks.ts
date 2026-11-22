import { addDays, weekStart } from './dates'
import type { LocalDate } from './types'

export type StreakFrequency = { type: 'daily' } | { type: 'weekly'; target: number }

export function dailyStreak(dates: LocalDate[], today: LocalDate): number {
  const set = new Set(dates)
  let cursor = set.has(today) ? today : addDays(today, -1)
  let count = 0
  while (set.has(cursor)) {
    count++
    cursor = addDays(cursor, -1)
  }
  return count
}

function weekCounts(dates: LocalDate[]): Map<LocalDate, number> {
  const counts = new Map<LocalDate, number>()
  for (const d of new Set(dates)) {
    const w = weekStart(d)
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  return counts
}

export function weeklyStreak(dates: LocalDate[], target: number, today: LocalDate): number {
  const counts = weekCounts(dates)
  let cursor = weekStart(today)
  if ((counts.get(cursor) ?? 0) < target) cursor = addDays(cursor, -7)
  let count = 0
  while ((counts.get(cursor) ?? 0) >= target) {
    count++
    cursor = addDays(cursor, -7)
  }
  return count
}

export function bestStreak(dates: LocalDate[], frequency: StreakFrequency): number {
  if (frequency.type === 'daily') {
    const sorted = [...new Set(dates)].sort()
    let best = 0
    let run = 0
    let prev: LocalDate | null = null
    for (const d of sorted) {
      run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1
      best = Math.max(best, run)
      prev = d
    }
    return best
  }
  const counts = weekCounts(dates)
  const weeks = [...counts.keys()].filter((w) => (counts.get(w) ?? 0) >= frequency.target).sort()
  let best = 0
  let run = 0
  let prev: LocalDate | null = null
  for (const w of weeks) {
    run = prev !== null && addDays(prev, 7) === w ? run + 1 : 1
    best = Math.max(best, run)
    prev = w
  }
  return best
}
