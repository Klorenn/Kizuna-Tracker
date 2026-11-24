import 'server-only'
import { fetchAll } from '@/lib/paginate'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

export type ScheduledKind = 'streak_risk' | 'weekly_summary'
export type NotificationTarget = { id: string; timezone: string }

/**
 * Live users with a push subscription who did not opt out of `kind` (the `notification_targets`
 * SQL function). Paged in a stable order: one select stops at max_rows and would silently drop users.
 */
export async function loadNotificationTargets(db: Db, kind: ScheduledKind): Promise<NotificationTarget[]> {
  const rows = await fetchAll((from, to) => db.rpc('notification_targets', { p_kind: kind }).order('user_id').range(from, to))
  return rows.map((r) => ({ id: r.user_id, timezone: r.timezone }))
}
