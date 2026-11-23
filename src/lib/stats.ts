import { addDays, weekStart } from '@/domain/dates'
import { bestStreak, dailyStreak, weeklyStreak } from '@/domain/streaks'
import type { LocalDate } from '@/domain/types'

/** The last `weeks` Monday-to-Sunday weeks (oldest first, current last), zeros included. Distinct dates only. */
export function weeklyCounts(
  dates: LocalDate[],
  weeks: number,
  today: LocalDate,
): { weekStart: LocalDate; count: number }[] {
  const unique = new Set(dates)
  const current = weekStart(today)
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(current, -7 * (weeks - 1 - i))
    const end = addDays(start, 6)
    let count = 0
    for (const d of unique) if (d >= start && d <= end) count++
    return { weekStart: start, count }
  })
}

/** The last `months` calendar months as `YYYY-MM` (oldest first, current last), zeros included. */
export function monthlyCounts(
  dates: LocalDate[],
  months: number,
  today: LocalDate,
): { month: string; count: number }[] {
  const unique = new Set(dates)
  const y = Number(today.slice(0, 4))
  const m = Number(today.slice(5, 7)) - 1
  return Array.from({ length: months }, (_, i) => {
    const idx = y * 12 + m - (months - 1 - i)
    const month = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
    let count = 0
    for (const d of unique) if (d.startsWith(month)) count++
    return { month, count }
  })
}

/** Resumen `?h=todos`: every habit at once (the default with two or more habits). */
export const ALL_HABITS = 'todos'

/** Stacked chart rows: one per bucket (week start or month) with each habit's count and the total. */
export function stackRows(
  buckets: string[],
  series: { id: string; counts: number[] }[],
): ({ bucket: string; total: number } & Record<string, number | string>)[] {
  return buckets.map((bucket, i) => {
    const row: { bucket: string; total: number } & Record<string, number | string> = { bucket, total: 0 }
    for (const s of series) {
      const n = s.counts[i] ?? 0
      row[s.id] = n
      row.total += n
    }
    return row
  })
}

/** Habit ids done on each date, in the order of `habits` (for the all-habits calendar dots). */
export function completionsByDay(habits: { id: string; dates: LocalDate[] }[]): Map<LocalDate, string[]> {
  const map = new Map<LocalDate, string[]>()
  for (const h of habits) {
    for (const d of new Set(h.dates)) {
      const list = map.get(d)
      if (list) list.push(h.id)
      else map.set(d, [h.id])
    }
  }
  return map
}

type ChallengeRow = { id: string; creator_id: string; rival_id: string; status: string }
type DebtRow = { challenge_id: string; debtor_id: string }

/** A finished challenge is won with fewer failures (debts as debtor) than the rival, lost with more. Ties count for neither. */
export function recordFromRows(
  userId: string,
  challenges: ChallengeRow[],
  debts: DebtRow[],
): { won: number; lost: number } {
  let won = 0
  let lost = 0
  for (const c of challenges) {
    if (c.status !== 'finished') continue
    const rivalId = c.creator_id === userId ? c.rival_id : c.creator_id
    const mine = debts.filter((d) => d.challenge_id === c.id && d.debtor_id === userId).length
    const theirs = debts.filter((d) => d.challenge_id === c.id && d.debtor_id === rivalId).length
    if (mine < theirs) won++
    else if (mine > theirs) lost++
  }
  return { won, lost }
}

/** Reads through the caller's session (RLS: challenges and debts are visible to participants). */
export async function challengeRecord(userId: string): Promise<{ won: number; lost: number }> {
  const { createServerClient } = await import('@/lib/supabase/server')
  const supabase = await createServerClient()
  const { data: challenges } = await supabase
    .from('challenges')
    .select('id,creator_id,rival_id,status')
    .eq('status', 'finished')
    .or(`creator_id.eq.${userId},rival_id.eq.${userId}`)
  const rows = challenges ?? []
  if (rows.length === 0) return { won: 0, lost: 0 }
  const { data: debts } = await supabase
    .from('debts')
    .select('challenge_id,debtor_id')
    .in('challenge_id', rows.map((c) => c.id))
  return recordFromRows(userId, rows, debts ?? [])
}

/** Streak history is read per habit: this many days back, newest first, always under the API row cap. */
export const STREAK_DAYS = 400
export function streakWindow(today: LocalDate): { from: LocalDate; limit: number } {
  return { from: addDays(today, -STREAK_DAYS), limit: STREAK_DAYS + 7 }
}

type HabitFreq = { frequency_type: string; target_per_week: number | null }

/**
 * Longest current and best streak across habits. Daily habits count days, weekly ones weeks;
 * they are ranked by days (a week = 7) and shown in their own unit.
 */
export function profileStreaks(
  habits: (HabitFreq & { dates: LocalDate[] })[],
  today: LocalDate,
): { current: { value: number; unit: 'days' | 'weeks' }; best: { value: number; unit: 'days' | 'weeks' } } {
  type Streak = { value: number; unit: 'days' | 'weeks' }
  let current: Streak = { value: 0, unit: 'days' }
  let best: Streak = { value: 0, unit: 'days' }
  const days = (x: { value: number; unit: 'days' | 'weeks' }) => (x.unit === 'weeks' ? x.value * 7 : x.value)
  for (const h of habits) {
    const weekly = h.frequency_type === 'weekly'
    const unit = weekly ? ('weeks' as const) : ('days' as const)
    const target = h.target_per_week ?? 1
    const c = { value: weekly ? weeklyStreak(h.dates, target, today) : dailyStreak(h.dates, today), unit }
    const b = { value: bestStreak(h.dates, weekly ? { type: 'weekly', target } : { type: 'daily' }), unit }
    if (days(c) > days(current)) current = c
    if (days(b) > days(best)) best = b
  }
  return { current, best }
}
