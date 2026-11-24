import 'server-only'
import { addDays, localDate } from '@/domain/dates'
import type { SummaryDebt } from '@/domain/weekly-summary'
import { fetchAll } from '@/lib/paginate'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { Frequency } from '@/domain/types'

type Db = ReturnType<typeof createAdminClient>

export type UserHabit = {
  id: string
  name: string
  visibility: string
  archivedAt: string | null
  createdAt: string
  frequency: Frequency
  dates: string[]
}

/** `.in()` lists travel in the URL: keep them short. */
const USER_CHUNK = 100
/** `checkin_dates` refuses more than 500 habit ids and answers one row per habit. */
const HABIT_CHUNK = 500
/** Far enough back for any streak the app can show. */
const HISTORY_DAYS = 3660

const chunks = <T>(list: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * Habits and their non-rejected check-in dates for these users. `streak-risk` loads only what the
 * streak push can name (active, daily, not private); `summary` loads every active habit. The habit
 * read is paged in a stable order; the dates come from `checkin_dates`, one row per habit.
 */
export async function loadUserHabits(db: Db, userIds: string[], scope: 'streak-risk' | 'summary'): Promise<Map<string, UserHabit[]>> {
  const byUser = new Map<string, UserHabit[]>(userIds.map((id) => [id, []]))
  const owner = new Map<string, UserHabit>()
  for (const ids of chunks(userIds, USER_CHUNK)) {
    const rows = await fetchAll((from, to) => {
      let q = db
        .from('habits')
        .select('id,user_id,name,visibility,archived_at,created_at,frequency_type,target_per_week')
        .in('user_id', ids)
        .is('archived_at', null)
      if (scope === 'streak-risk') q = q.eq('frequency_type', 'daily').neq('visibility', 'private')
      return q.order('id').range(from, to)
    })
    for (const r of rows) {
      const h: UserHabit = {
        id: r.id,
        name: r.name,
        visibility: r.visibility,
        archivedAt: r.archived_at,
        createdAt: r.created_at,
        frequency: r.frequency_type === 'weekly' ? { type: 'weekly', target: r.target_per_week ?? 1 } : { type: 'daily' },
        dates: [],
      }
      owner.set(r.id, h)
      byUser.get(r.user_id)?.push(h)
    }
  }
  const from = addDays(localDate(new Date(), 'UTC'), -HISTORY_DAYS)
  for (const habitIds of chunks([...owner.keys()], HABIT_CHUNK)) {
    const { data, error } = await db.rpc('checkin_dates', { p_habit_ids: habitIds, p_from: from })
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const h = owner.get(row.habit_id)
      if (h) h.dates = row.dates
    }
  }
  return byUser
}

/**
 * Debts that matter to the weekly summary for these users: every unpaid one (the balance) and
 * every one created in the last 9 days (the challenges settled this local week; 9 covers any
 * UTC offset). Paged in a stable order.
 */
export async function loadUserDebts(db: Db, userIds: string[], now: Date): Promise<Map<string, SummaryDebt[]>> {
  const out = new Map<string, SummaryDebt[]>(userIds.map((id) => [id, []]))
  const since = new Date(now.getTime() - 9 * 86_400_000).toISOString()
  for (const ids of chunks(userIds, USER_CHUNK)) {
    const list = ids.join(',')
    const involved = `debtor_id.in.(${list}),creditor_id.in.(${list})`
    const [unpaid, recent] = await Promise.all([
      fetchAll((from, to) =>
        db.from('debts').select('id,debtor_id,creditor_id,amount,paid_at,created_at').is('paid_at', null).or(involved).order('id').range(from, to),
      ),
      fetchAll((from, to) =>
        db.from('debts').select('id,debtor_id,creditor_id,amount,paid_at,created_at').gte('created_at', since).or(involved).order('id').range(from, to),
      ),
    ])
    const seen = new Set<string>()
    for (const d of [...unpaid, ...recent]) {
      if (seen.has(d.id)) continue
      seen.add(d.id)
      const debt: SummaryDebt = { debtorId: d.debtor_id, creditorId: d.creditor_id, amount: d.amount, paidAt: d.paid_at, createdAt: d.created_at }
      for (const uid of new Set([d.debtor_id, d.creditor_id])) out.get(uid)?.push(debt)
    }
  }
  return out
}
