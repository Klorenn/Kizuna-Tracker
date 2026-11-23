import { monthBounds, monthOf, type MonthKey } from './calendar'
import { addDays, weekStart } from './dates'
import type { LocalDate } from './types'

// Time logs: how long you spent on a habit. Pure functions, no I/O. Time never touches
// streaks, challenges, debts or goals: it is the detail of a check-in, nothing more.

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 45 -> "45 min", 60 -> "1 h", 85 -> "1 h 25 min", 0 -> "0 min". */
export function formatDuration(min: number): string {
  const total = Math.max(0, Math.round(min))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** "+2 h 10 min", "−45 min" (a real minus sign), "0 min". */
export function formatSignedDuration(min: number): string {
  const r = Math.round(min)
  if (r === 0) return '0 min'
  return `${r > 0 ? '+' : '−'}${formatDuration(Math.abs(r))}`
}

/** Seconds as "29:40" or "1:01:40" (hours only when there are some). */
export function formatHms(sec: number): string {
  const total = Math.max(0, Math.round(sec))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`
}

/** Timer readout "25:00": remaining milliseconds rounded up to the next second, minutes unbounded. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`
}

/** Hours and minutes from two text fields (either may be empty): 1 to 1.440 minutes, else null. */
export function parseDuration(h: string, m: string): number | null {
  const hs = h.trim()
  const ms = m.trim()
  if ((hs !== '' && !/^\d{1,2}$/.test(hs)) || (ms !== '' && !/^\d{1,4}$/.test(ms))) return null
  const minutes = Number(ms === '' ? 0 : ms)
  if (minutes > 59) return null
  const total = Number(hs === '' ? 0 : hs) * 60 + minutes
  return total >= 1 && total <= 1440 ? total : null
}

export type TimeEntry = { date: LocalDate; habitId: string; minutes: number; topic: string | null; pomodoros: number }

export function monthlyTime(
  entries: TimeEntry[],
  month: MonthKey,
  habitId?: string,
): {
  month: MonthKey
  minutes: number
  days: number
  averagePerDay: number
  bestDay: { date: LocalDate; minutes: number } | null
  pomodoros: number
} {
  const inMonth = entries.filter((e) => monthOf(e.date) === month && (habitId === undefined || e.habitId === habitId))
  const perDay = new Map<LocalDate, number>()
  for (const e of inMonth) perDay.set(e.date, (perDay.get(e.date) ?? 0) + e.minutes)
  const minutes = inMonth.reduce((sum, e) => sum + e.minutes, 0)
  let bestDay: { date: LocalDate; minutes: number } | null = null
  for (const [date, mins] of perDay) {
    if (bestDay === null || mins > bestDay.minutes || (mins === bestDay.minutes && date < bestDay.date)) {
      bestDay = { date, minutes: mins }
    }
  }
  return {
    month,
    minutes,
    days: perDay.size,
    averagePerDay: perDay.size === 0 ? 0 : Math.round(minutes / perDay.size),
    bestDay,
    pomodoros: inMonth.reduce((sum, e) => sum + e.pomodoros, 0),
  }
}

export function timeSeries(
  entries: TimeEntry[],
  months: MonthKey[],
  habitId?: string,
): { month: MonthKey; minutes: number }[] {
  return months.map((month) => ({ month, minutes: monthlyTime(entries, month, habitId).minutes }))
}

/**
 * Monday-start weeks that touch `month`, oldest first; each week sums only the points that fall
 * inside the month (so the first and last bars are clipped).
 */
export function weeklyTotals(
  points: { date: LocalDate; value: number }[],
  month: MonthKey,
): { weekStart: LocalDate; value: number }[] {
  const { first, last } = monthBounds(month)
  const totals = new Map<LocalDate, number>()
  for (let start = weekStart(first); start <= last; start = addDays(start, 7)) totals.set(start, 0)
  for (const p of points) {
    if (monthOf(p.date) !== month) continue
    const start = weekStart(p.date)
    totals.set(start, (totals.get(start) ?? 0) + p.value)
  }
  return [...totals.entries()].map(([start, value]) => ({ weekStart: start, value: Math.round(value * 100) / 100 }))
}
