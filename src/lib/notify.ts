import type { Json } from '@/lib/supabase/database.types'
import { notificationView, type NotificationType } from '@/lib/notification-copy'
import { sendPush } from '@/lib/push'

type Row = { id: string; user_id: string; type: string; payload: Json }

function asPayload(p: Json): Record<string, unknown> {
  return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : {}
}

/**
 * Claims rows (pushed_at null -> now) and pushes the ones this call won. The conditional
 * update is the idempotency guard: two concurrent senders can never both push the same row.
 */
async function claimAndPush(db: Awaited<ReturnType<typeof admin>>, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { data } = await db
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .in('id', ids)
    .is('pushed_at', null)
    .select('id,user_id,type,payload')
  await Promise.all(
    ((data ?? []) as Row[]).map((r) => sendPush(r.user_id, notificationView(r.type, asPayload(r.payload)))),
  )
}

async function admin() {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  return createAdminClient()
}

/**
 * Stores an in-app notification and pushes it to the user's devices. Never throws: a
 * failed notification must not undo the action that caused it.
 */
export async function notify(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const db = await admin()
    const { data, error } = await db
      .from('notifications')
      .insert({ user_id: userId, type, payload: payload as Json })
      .select('id')
      .single()
    if (error || !data) throw error ?? new Error('no row')
    await claimAndPush(db, [data.id])
  } catch (e) {
    console.error('notify failed', type, e)
  }
}

/**
 * Pushes notifications inserted outside notify() (e.g. photo_rejected from the reject_checkin
 * RPC). Called by the reminders cron every 15 minutes; rows older than a day are skipped.
 */
export async function pushPendingNotifications(): Promise<number> {
  const db = await admin()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await db
    .from('notifications')
    .select('id')
    .is('pushed_at', null)
    .gte('created_at', since)
    .order('created_at')
    .limit(200)
  if (error) throw error
  const ids = (data ?? []).map((r) => r.id)
  await claimAndPush(db, ids)
  return ids.length
}
