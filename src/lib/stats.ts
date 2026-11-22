import { addDays, weekStart } from '@/domain/dates'
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
