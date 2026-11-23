import { addDays, localDate, weekStart } from '@/domain/dates'
import { formatSignedCLP } from '@/domain/ledger'
import type { LocalDate } from '@/domain/types'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const monthOf = (d: LocalDate) => MONTHS[Number(d.slice(5, 7)) - 1]

/** "Miembro desde nov 2026", in the user's timezone. Null when the instant is unreadable. */
export function memberSince(createdAt: string, timeZone: string): string | null {
  const instant = new Date(createdAt)
  if (Number.isNaN(instant.getTime())) return null
  const d = localDate(instant, timeZone)
  return `Miembro desde ${monthOf(d)} ${d.slice(0, 4)}`
}

/** Same window as public.set_timezone: one change every 7 days. */
const TZ_LOCK_MS = 7 * 24 * 60 * 60 * 1000

export type TimezoneLock = { locked: false } | { locked: true; until: string; label: string }

/** Whether the timezone can change now; when not, the next allowed instant ("27 nov, 12:05", local). */
export function timezoneLock(changedAt: string | null, now: Date, timeZone: string): TimezoneLock {
  if (!changedAt) return { locked: false }
  const changed = new Date(changedAt).getTime()
  if (Number.isNaN(changed)) return { locked: false }
  const until = new Date(changed + TZ_LOCK_MS)
  if (now.getTime() >= until.getTime()) return { locked: false }
  const day = localDate(until, timeZone)
  const time = new Intl.DateTimeFormat('es-CL', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(until)
  return { locked: true, until: until.toISOString(), label: `${Number(day.slice(8))} ${monthOf(day)}, ${time}` }
}

/** The last `n` days ending today (oldest first), marked done when the habit has a check-in. */
export function lastDays(dates: LocalDate[], today: LocalDate, n = 7): { date: LocalDate; done: boolean }[] {
  const done = new Set(dates)
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - (n - 1))
    return { date, done: done.has(date) }
  })
}

export type ActivityCell = { date: LocalDate; count: number; level: 0 | 1 | 2 | 3 | 4; future: boolean }

/**
 * Perfil heatmap: `weeks` Monday-to-Sunday columns ending in the current week. A day's level is
 * the share of the user's habits done that day, in quarters (any check-in is at least 1).
 */
export function activityGrid(
  habits: { dates: LocalDate[] }[],
  today: LocalDate,
  weeks = 12,
): { weeks: ActivityCell[][]; monthLabels: (string | null)[]; total: number; activeDays: number } {
  const counts = new Map<LocalDate, number>()
  for (const h of habits) for (const d of new Set(h.dates)) counts.set(d, (counts.get(d) ?? 0) + 1)
  const size = Math.max(1, habits.length)
  const first = addDays(weekStart(today), -7 * (weeks - 1))
  let total = 0
  let activeDays = 0
  const grid = Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d): ActivityCell => {
      const date = addDays(first, w * 7 + d)
      const future = date > today
      const count = future ? 0 : (counts.get(date) ?? 0)
      total += count
      if (count > 0) activeDays++
      const level = (count === 0 ? 0 : Math.min(4, Math.ceil((count / size) * 4))) as ActivityCell['level']
      return { date, count, level, future }
    }),
  )
  const monthLabels = grid.map((col, i) => {
    const firstOfMonth = col.find((c) => c.date.endsWith('-01'))
    if (firstOfMonth) return monthOf(firstOfMonth.date)
    return i === 0 ? monthOf(col[0].date) : null
  })
  // adjacent labels would overlap: keep the one that marks a real month start
  if (monthLabels[1] && !grid[0].some((c) => c.date.endsWith('-01'))) monthLabels[0] = null
  return { weeks: grid, monthLabels, total, activeDays }
}

/** Net balance for the Perfil pill: explicit sign plus words, never color alone. */
export function debtSummary(net: number): { amount: string; caption: string } {
  return {
    amount: formatSignedCLP(net),
    caption: net > 0 ? 'te deben' : net < 0 ? 'debes' : 'sin saldo',
  }
}

export function streakText(value: number, unit: 'days' | 'weeks'): string {
  if (unit === 'weeks') return value === 1 ? 'semana' : 'semanas'
  return value === 1 ? 'día' : 'días'
}
