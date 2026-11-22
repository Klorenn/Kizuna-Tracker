export type PushPayload = { title: string; body: string; url: string }
export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string }

export type PushDeps = {
  listSubscriptions(userId: string): Promise<PushSubscriptionRow[]>
  deleteSubscription(endpoint: string): Promise<void>
  send(sub: PushSubscriptionRow, body: string): Promise<void>
}

export function vapidConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT)
}

/** Real dependencies: service-role reads/deletes and web-push. Loaded lazily so tests need no keys. */
async function defaultDeps(): Promise<PushDeps> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const db = createAdminClient()
  return {
    async listSubscriptions(userId) {
      const { data, error } = await db
        .from('push_subscriptions')
        .select('endpoint,p256dh,auth')
        .eq('user_id', userId)
      if (error) throw error
      return data ?? []
    },
    async deleteSubscription(endpoint) {
      await db.from('push_subscriptions').delete().eq('endpoint', endpoint)
    },
    async send(sub, body) {
      const webpush = (await import('web-push')).default
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT!,
        process.env.VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!,
      )
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: 60 * 60 * 12 },
      )
    },
  }
}

/**
 * Push to every device of a user. Subscriptions answering 404/410 are gone for good and are
 * deleted; any other failure is logged and swallowed (a push must never break the caller).
 * Without VAPID keys (local dev, tests) it does nothing.
 */
export async function sendPush(userId: string, payload: PushPayload, deps?: PushDeps): Promise<void> {
  if (!deps && !vapidConfigured()) return
  try {
    const d = deps ?? (await defaultDeps())
    const subs = await d.listSubscriptions(userId)
    const body = JSON.stringify(payload)
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await d.send(sub, body)
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) await d.deleteSubscription(sub.endpoint)
          else console.error('push failed', status ?? e)
        }
      }),
    )
  } catch (e) {
    console.error('sendPush failed', e)
  }
}
