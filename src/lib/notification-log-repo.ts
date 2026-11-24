import 'server-only'
import type { ScheduledKind } from '@/lib/notification-targets-repo'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

const CLAIM_BATCH = 500

/**
 * Claims the (user, kind, local date) slot; returns only the users this call won, so overlapping or
 * retried runs never send a second push for the same day. Batched: the returned rows are capped at
 * max_rows too, and a claimed user missing from the answer would never get today's push.
 */
export async function claimNotifications(
  db: Db,
  kind: ScheduledKind,
  entries: { id: string; localDate: string }[],
): Promise<string[]> {
  const won: string[] = []
  for (let i = 0; i < entries.length; i += CLAIM_BATCH) {
    const { data, error } = await db
      .from('notification_log')
      .upsert(
        entries.slice(i, i + CLAIM_BATCH).map((e) => ({ user_id: e.id, kind, local_date: e.localDate })),
        { onConflict: 'user_id,kind,local_date', ignoreDuplicates: true },
      )
      .select('user_id')
    if (error) throw error
    won.push(...(data ?? []).map((r) => r.user_id))
  }
  return won
}
