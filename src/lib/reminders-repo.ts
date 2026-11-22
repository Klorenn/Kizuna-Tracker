import { addDays, localDate, weekStart } from '@/domain/dates'
import type { ReminderCandidate } from '@/lib/reminders'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

/** Active users with at least one push subscription, and whether they still owe a check-in today. */
export async function loadReminderCandidates(db: Db, now: Date): Promise<ReminderCandidate[]> {
  const { data: subs, error: subsError } = await db.from('push_subscriptions').select('user_id')
  if (subsError) throw subsError
  const userIds = [...new Set((subs ?? []).map((s) => s.user_id))]
  if (userIds.length === 0) return []

  const { data: profiles, error } = await db
    .from('profiles')
    .select('id,timezone,reminder_time')
    .in('id', userIds)
    .is('deleted_at', null)
  if (error) throw error

  const [habits, checkins] = await Promise.all([
    db
      .from('habits')
      .select('id,user_id,frequency_type,target_per_week')
      .in('user_id', userIds)
      .is('archived_at', null),
    db
      .from('checkins')
      .select('habit_id,user_id,local_date')
      .in('user_id', userIds)
      .is('rejected_at', null)
      .gte('local_date', localDate(new Date(now.getTime() - 9 * 86400_000), 'UTC')),
  ])
  if (habits.error) throw habits.error
  if (checkins.error) throw checkins.error

  return (profiles ?? []).map((p) => {
    const today = localDate(now, p.timezone)
    const monday = weekStart(today)
    const mine = (checkins.data ?? []).filter((c) => c.user_id === p.id)
    const pending = (habits.data ?? []).some((h) => {
      if (h.user_id !== p.id) return false
      const dates = mine.filter((c) => c.habit_id === h.id).map((c) => c.local_date)
      if (dates.includes(today)) return false
      if (h.frequency_type === 'weekly') {
        const inWeek = dates.filter((d) => d >= monday && d <= addDays(monday, 6)).length
        return inWeek < (h.target_per_week ?? 1)
      }
      return true
    })
    return { id: p.id, timezone: p.timezone, reminderTime: String(p.reminder_time), pendingToday: pending }
  })
}

/** Users who already got today's reminder (idempotency across overlapping cron runs). */
export async function alreadyReminded(db: Db, userIds: string[], now: Date): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const { data, error } = await db
    .from('notifications')
    .select('user_id')
    .eq('type', 'reminder')
    .in('user_id', userIds)
    .gte('created_at', new Date(now.getTime() - 20 * 3600_000).toISOString())
  if (error) throw error
  return new Set((data ?? []).map((r) => r.user_id))
}
