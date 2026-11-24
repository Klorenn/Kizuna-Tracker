/**
 * Expo push receipts, checked by the reminders cron (every 15 minutes). A ticket only says Expo ACCEPTED the
 * message; the receipt says whether the device took it. `DeviceNotRegistered` means the token is dead and is
 * deleted. Expo keeps receipts for 24 hours, so a ticket older than that is dropped even without one.
 * Pure of Next and Supabase: `supabaseReceiptDeps` is the only part that touches the database / network.
 */
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
export const RECEIPT_CHUNK = 1000
const RECEIPT_DELAY_MS = 15 * 60_000
const TICKET_TTL_MS = 24 * 60 * 60_000
const DUE_LIMIT = 5000

export type ExpoReceipt = { status: 'ok' } | { status: 'error'; message?: string; details?: { error?: string } }
export type DueTicket = { ticket_id: string; token: string; created_at: string }

export interface ReceiptDeps {
  listDueTickets(olderThan: Date): Promise<DueTicket[]>
  getReceipts(ids: string[]): Promise<Record<string, ExpoReceipt>>
  deleteDeviceTokens(tokens: string[]): Promise<void>
  deleteTickets(ids: string[]): Promise<void>
}

export type ReceiptSummary = { checked: number; tokensRemoved: number; ticketsRemoved: number }

export async function checkPushReceipts(deps: ReceiptDeps, now: Date = new Date()): Promise<ReceiptSummary> {
  const due = await deps.listDueTickets(new Date(now.getTime() - RECEIPT_DELAY_MS))
  const summary: ReceiptSummary = { checked: due.length, tokensRemoved: 0, ticketsRemoved: 0 }
  for (let i = 0; i < due.length; i += RECEIPT_CHUNK) {
    const chunk = due.slice(i, i + RECEIPT_CHUNK)
    let receipts: Record<string, ExpoReceipt>
    try {
      receipts = await deps.getReceipts(chunk.map((t) => t.ticket_id))
    } catch (e) {
      console.error('expo receipts failed', e) // the chunk stays for the next run
      continue
    }
    const drop: string[] = []
    const gone = new Set<string>()
    for (const t of chunk) {
      const r = receipts[t.ticket_id]
      if (r) {
        drop.push(t.ticket_id)
        if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') gone.add(t.token)
      } else if (now.getTime() - new Date(t.created_at).getTime() > TICKET_TTL_MS) {
        drop.push(t.ticket_id)
      }
    }
    if (gone.size > 0) {
      await deps.deleteDeviceTokens([...gone])
      summary.tokensRemoved += gone.size
    }
    if (drop.length > 0) {
      await deps.deleteTickets(drop)
      summary.ticketsRemoved += drop.length
    }
  }
  return summary
}

type Admin = {
  from(table: 'expo_push_tickets' | 'device_push_tokens'): {
    select(cols: string): { lt(col: string, v: string): { order(col: string): { limit(n: number): PromiseLike<{ data: DueTicket[] | null; error: unknown }> } } }
    delete(): { in(col: string, v: string[]): PromiseLike<{ error: unknown }> }
  }
}

/** Real dependencies over a service-role client (the cron passes `createAdminClient()`). */
export function supabaseReceiptDeps(db: unknown, fetchFn: typeof fetch = fetch): ReceiptDeps {
  const admin = db as Admin
  return {
    async listDueTickets(olderThan) {
      const { data, error } = await admin
        .from('expo_push_tickets')
        .select('ticket_id,token,created_at')
        .lt('created_at', olderThan.toISOString())
        .order('created_at')
        .limit(DUE_LIMIT)
      if (error) throw error
      return data ?? []
    },
    async getReceipts(ids) {
      const headers: Record<string, string> = { accept: 'application/json', 'content-type': 'application/json' }
      if (process.env.EXPO_ACCESS_TOKEN) headers.authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`
      const res = await fetchFn(RECEIPTS_URL, { method: 'POST', headers, body: JSON.stringify({ ids }), signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`expo receipts ${res.status}`)
      const json = (await res.json()) as { data?: Record<string, ExpoReceipt> }
      return json.data ?? {}
    },
    async deleteDeviceTokens(tokens) {
      const { error } = await admin.from('device_push_tokens').delete().in('token', tokens)
      if (error) throw error
    },
    async deleteTickets(ids) {
      const { error } = await admin.from('expo_push_tickets').delete().in('ticket_id', ids)
      if (error) throw error
    },
  }
}
