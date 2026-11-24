import { dailyStreak } from './streaks'
import type { Frequency, LocalDate } from './types'

/** A streak shorter than this is not worth a push. */
export const MIN_RISK_STREAK = 3

export type RiskHabit = {
  id: string
  name: string
  visibility: string
  archivedAt: string | null
  frequency: Frequency
  /** non-rejected check-in dates */
  dates: LocalDate[]
}

export type StreakRisk = { habitName: string; streak: number; /** other habits at risk besides the named one */ more: number }

/**
 * The habit whose streak is about to break: daily, public or friends-only (a private habit's name
 * never reaches a lock screen), active, not done today, streak of MIN_RISK_STREAK days or more
 * (counted up to yesterday, as the Hoy screen does). Weekly habits are out: their streak counts
 * weeks and the copy says days. The biggest streak is named; ties go to the name, then the id.
 */
export function streakAtRisk(habits: RiskHabit[], today: LocalDate): StreakRisk | null {
  const risky = habits
    .filter((h) => h.archivedAt === null && h.visibility !== 'private' && h.frequency.type === 'daily')
    .filter((h) => !h.dates.includes(today))
    .map((h) => ({ h, streak: dailyStreak(h.dates, today) }))
    .filter((r) => r.streak >= MIN_RISK_STREAK)
    .sort((a, b) => b.streak - a.streak || a.h.name.localeCompare(b.h.name) || a.h.id.localeCompare(b.h.id))
  if (risky.length === 0) return null
  return { habitName: risky[0].h.name, streak: risky[0].streak, more: risky.length - 1 }
}
