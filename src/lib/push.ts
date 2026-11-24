import 'server-only'
import { isAllowedPushEndpoint } from '@/lib/push-endpoint'

export type PushPayload = { title: string; body: string; url: string }
export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string }

/** One Expo push message. `data.url` is the web path the app deep-links to on tap. */
export type ExpoMessage = {
  to: string
  title: string
  body: string
  data: { url: string }
  channelId: 'default'
  priority: 'high'
  sound: 'default'
}
export type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: { error?: string } }
export type TicketRow = { ticket_id: string; token: string }

export type PushDeps = {
  listSubscriptions(userId: string): Promise<PushSubscriptionRow[]>
  deleteSubscription(endpoint: string): Promise<void>
  send(sub: PushSubscriptionRow, body: string): Promise<void>
  /** false skips the web channel (VAPID keys unset). Defaults to true for injected deps. */
  vapidEnabled?: boolean
  // Expo channel (native app). All optional: callers that only inject the web deps keep working.
  listDeviceTokens?(userId: string): Promise<string[]>
  deleteDeviceTokens?(tokens: string[]): Promise<void>
  /** One request of at most EXPO_CHUNK messages; tickets come back in the same order. */
  sendExpo?(messages: ExpoMessage[]): Promise<ExpoTicket[]>
  saveTickets?(rows: TicketRow[]): Promise<void>
}

export const MAX_CONCURRENCY = 10
export const EXPO_CHUNK = 100
const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send'

function expoHeaders(): Record<string, string> {
  const h: Record<string, string> = { accept: 'application/json', 'content-type': 'application/json' }
  if (process.env.EXPO_ACCESS_TOKEN) h.authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`
  return h
}

/** POSTs one batch to the Expo push API and returns its tickets. Throws on a non-2xx answer or a timeout. */
export async function postExpoMessages(messages: ExpoMessage[], fetchFn: typeof fetch = fetch): Promise<ExpoTicket[]> {
  const res = await fetchFn(EXPO_SEND_URL, {
    method: 'POST',
    headers: expoHeaders(),
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`expo push ${res.status}`)
  const json = (await res.json()) as { data?: ExpoTicket[] }
  return Array.isArray(json.data) ? json.data : []
}

export function vapidConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT)
}

/** Real dependencies: service-role reads/deletes and web-push. Loaded lazily so tests need no keys. */
async function defaultDeps(): Promise<PushDeps> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const db = createAdminClient()
  return {
    vapidEnabled: vapidConfigured(),
    async listDeviceTokens(userId) {
      const { data, error } = await db.from('device_push_tokens').select('token').eq('user_id', userId)
      if (error) throw error
      return (data ?? []).map((r) => r.token)
    },
    async deleteDeviceTokens(tokens) {
      if (tokens.length > 0) await db.from('device_push_tokens').delete().in('token', tokens)
    },
    sendExpo: (messages) => postExpoMessages(messages),
    async saveTickets(rows) {
      if (rows.length === 0) return
      const { error } = await db.from('expo_push_tickets').upsert(rows, { onConflict: 'ticket_id', ignoreDuplicates: true })
      if (error) throw error
    },
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
        { timeout: 5000, TTL: 3600, urgency: 'normal' },
      )
    },
  }
}

/** Web channel (VAPID): the original loop. Subscriptions answering 404/410 are deleted, the rest is logged. */
async function sendWeb(d: PushDeps, userId: string, payload: PushPayload): Promise<void> {
  const subs = await d.listSubscriptions(userId)
  const body = JSON.stringify(payload)
  for (let i = 0; i < subs.length; i += MAX_CONCURRENCY) {
    await Promise.all(
      subs.slice(i, i + MAX_CONCURRENCY).map(async (sub) => {
        try {
          if (!isAllowedPushEndpoint(sub.endpoint)) {
            await d.deleteSubscription(sub.endpoint)
            return
          }
          await d.send(sub, body)
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) await d.deleteSubscription(sub.endpoint)
          else console.error('push failed', status ?? e)
        }
      }),
    )
  }
}

/** Expo channel (native app): batches of 100; tickets saved for the receipts cron; DeviceNotRegistered deletes the token. */
async function sendExpoChannel(d: PushDeps, userId: string, payload: PushPayload): Promise<void> {
  if (!d.listDeviceTokens || !d.sendExpo) return
  const tokens = await d.listDeviceTokens(userId)
  for (let i = 0; i < tokens.length; i += EXPO_CHUNK) {
    const chunk = tokens.slice(i, i + EXPO_CHUNK)
    try {
      const tickets = await d.sendExpo(
        chunk.map((to) => ({ to, title: payload.title, body: payload.body, data: { url: payload.url }, channelId: 'default', priority: 'high', sound: 'default' })),
      )
      const gone: string[] = []
      const saved: TicketRow[] = []
      tickets.forEach((t, j) => {
        if (t.status === 'ok') saved.push({ ticket_id: t.id, token: chunk[j] })
        else if (t.details?.error === 'DeviceNotRegistered') gone.push(chunk[j])
        else console.error('expo push error', t.details?.error ?? t.message)
      })
      if (gone.length > 0) await d.deleteDeviceTokens?.(gone)
      if (saved.length > 0) await d.saveTickets?.(saved).catch((e) => console.error('expo tickets not saved', e))
    } catch (e) {
      console.error('expo push failed', e)
    }
  }
}

/**
 * Push to every device of a user, on every channel: VAPID for web subscriptions and Expo for the native app.
 * Each channel has its own try, so one failing never stops the other and a push never breaks the caller.
 * Web: subscriptions answering 404/410 are gone for good and are deleted; an endpoint outside the push-service
 * allow-list is never contacted (SSRF) and is deleted. Without VAPID keys the web channel is skipped, but the
 * Expo channel still runs.
 */
export async function sendPush(userId: string, payload: PushPayload, deps?: PushDeps): Promise<void> {
  try {
    const d = deps ?? (await defaultDeps())
    if (d.vapidEnabled !== false) {
      try {
        await sendWeb(d, userId, payload)
      } catch (e) {
        console.error('sendPush failed', e)
      }
    }
    try {
      await sendExpoChannel(d, userId, payload)
    } catch (e) {
      console.error('sendPush expo failed', e)
    }
  } catch (e) {
    console.error('sendPush failed', e)
  }
}
