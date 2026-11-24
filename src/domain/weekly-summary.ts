import { addDays, localDate, weekStart } from './dates'
import { dailyStreak } from './streaks'
import type { Frequency, LocalDate } from './types'

export type SummaryHabit = {
  id: string
  name: string
  visibility: string
  archivedAt: string | null
  createdAt: string
  frequency: Frequency
  /** non-rejected check-in dates */
  dates: LocalDate[]
}

export type SummaryDebt = { debtorId: string; creditorId: string; amount: number; paidAt: string | null; createdAt: string }

export type WeeklySummary = {
  done: number
  due: number
  bestStreak: number
  bestHabit: string | null
  won: number
  lost: number
  /** net of unpaid debts: negative = I owe, positive = I am owed */
  balance: number
}

/**
 * Summary of the ISO week (Monday to Sunday) that ends on `today` (a Sunday, in the user's zone).
 * Due: a daily habit is due every day since it existed this week, a weekly one `target` times
 * (never more than the days it had). Done is capped at due. Challenges are counted from the debts
 * the period close generated this local week (creditor won, debtor lost): the period that ends
 * tonight closes tomorrow, so these are the ones that settled since Monday. Returns null when
 * nothing was due, so a user with no habits gets no push.
 */
export function weeklySummary(input: {
  habits: SummaryHabit[]
  debts: SummaryDebt[]
  me: string
  today: LocalDate
  timeZone: string
}): WeeklySummary | null {
  const { habits, debts, me, today, timeZone } = input
  const monday = weekStart(today)
  const sunday = addDays(monday, 6)
  const active = habits.filter((h) => h.archivedAt === null)

  let done = 0
  let due = 0
  for (const h of active) {
    const created = localDate(new Date(h.createdAt), timeZone)
    const first = created > monday ? created : monday
    const days = first > sunday ? 0 : daysBetween(first, sunday) + 1
    const inWeek = new Set(h.dates.filter((d) => d >= first && d <= sunday)).size
    const habitDue = h.frequency.type === 'daily' ? days : Math.min(h.frequency.target, days)
    due += habitDue
    done += Math.min(inWeek, habitDue)
  }
  if (due === 0) return null

  const streaks = active
    .filter((h) => h.visibility !== 'private' && h.frequency.type === 'daily')
    .map((h) => ({ h, streak: dailyStreak(h.dates, today) }))
    .filter((s) => s.streak > 0)
    .sort((a, b) => b.streak - a.streak || a.h.name.localeCompare(b.h.name) || a.h.id.localeCompare(b.h.id))

  let won = 0
  let lost = 0
  let balance = 0
  for (const d of debts) {
    const mine = d.creditorId === me ? 1 : d.debtorId === me ? -1 : 0
    if (mine === 0) continue
    const settled = localDate(new Date(d.createdAt), timeZone)
    if (settled >= monday && settled <= sunday) mine === 1 ? won++ : lost++
    if (d.paidAt === null) balance += mine * d.amount
  }

  return { done, due, bestStreak: streaks[0]?.streak ?? 0, bestHabit: streaks[0]?.h.name ?? null, won, lost, balance }
}

function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}
