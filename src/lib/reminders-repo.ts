import 'server-only'
import { fetchAll } from '@/lib/paginate'
import type { DueReminder, ReminderCandidate } from '@/lib/reminders'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

/**
 * Live users with at least one push subscription, and whether they still owe a check-in today
 * (computed by the `reminder_candidates` SQL function in each user's timezone). Paged: one
 * select stops at max_rows, which used to drop users and their check-ins silently.
 */
export async function loadReminderCandidates(db: Db): Promise<ReminderCandidate[]> {
  const rows = await fetchAll((from, to) => db.rpc('reminder_candidates').order('user_id').range(from, to))
  return rows.map((r) => ({
    id: r.user_id,
    timezone: r.timezone,
    reminderTime: String(r.reminder_time),
    pendingToday: r.pending_today,
  }))
}

const CLAIM_BATCH = 500

/**
 * Claims today's reminder slot per user; returns only the users this call won (never double-sends).
 * Batched: the returned rows are capped at max_rows too, and a claimed user missing from the
 * answer would never get today's reminder.
 */
export async function claimReminders(db: Db, due: DueReminder[]): Promise<string[]> {
  const won: string[] = []
  for (let i = 0; i < due.length; i += CLAIM_BATCH) {
    const { data, error } = await db
      .from('reminder_log')
      .upsert(
        due.slice(i, i + CLAIM_BATCH).map((d) => ({ user_id: d.id, local_date: d.localDate })),
        { onConflict: 'user_id,local_date', ignoreDuplicates: true },
      )
      .select('user_id')
    if (error) throw error
    won.push(...(data ?? []).map((r) => r.user_id))
  }
  return won
}
