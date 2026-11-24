import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkPushReceipts, RECEIPT_CHUNK, supabaseReceiptDeps, type ReceiptDeps } from '@/lib/push-receipts'

const NOW = new Date('2026-11-24T12:00:00Z')
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString()
const ticket = (id: string, token: string, minutes: number) => ({ ticket_id: id, token, created_at: ago(minutes) })

function deps(over: Partial<ReceiptDeps> = {}): ReceiptDeps {
  return {
    listDueTickets: vi.fn(async () => []),
    getReceipts: vi.fn(async () => ({})),
    deleteDeviceTokens: vi.fn(async () => {}),
    deleteTickets: vi.fn(async () => {}),
    ...over,
  }
}

describe('checkPushReceipts', () => {
  it('asks only for tickets older than 15 minutes', async () => {
    const d = deps()
    await checkPushReceipts(d, NOW)
    expect(d.listDueTickets).toHaveBeenCalledWith(new Date(NOW.getTime() - 15 * 60_000))
  })
  it('a delivered ticket is dropped and its token is kept', async () => {
    const d = deps({
      listDueTickets: vi.fn(async () => [ticket('a', 'tok-a', 20)]),
      getReceipts: vi.fn(async () => ({ a: { status: 'ok' as const } })),
    })
    const out = await checkPushReceipts(d, NOW)
    expect(d.deleteTickets).toHaveBeenCalledWith(['a'])
    expect(d.deleteDeviceTokens).not.toHaveBeenCalled()
    expect(out).toEqual({ checked: 1, tokensRemoved: 0, ticketsRemoved: 1 })
  })
  it('DeviceNotRegistered deletes the token; other errors only drop the ticket', async () => {
    const d = deps({
      listDueTickets: vi.fn(async () => [ticket('a', 'tok-a', 20), ticket('b', 'tok-b', 20)]),
      getReceipts: vi.fn(async () => ({
        a: { status: 'error' as const, details: { error: 'DeviceNotRegistered' } },
        b: { status: 'error' as const, details: { error: 'MessageRateExceeded' } },
      })),
    })
    const out = await checkPushReceipts(d, NOW)
    expect(d.deleteDeviceTokens).toHaveBeenCalledWith(['tok-a'])
    expect(d.deleteTickets).toHaveBeenCalledWith(['a', 'b'])
    expect(out).toEqual({ checked: 2, tokensRemoved: 1, ticketsRemoved: 2 })
  })
  it('a ticket Expo has no receipt for yet stays; one older than 24h is deleted anyway', async () => {
    const d = deps({
      listDueTickets: vi.fn(async () => [ticket('fresh', 'tok-1', 30), ticket('stale', 'tok-2', 25 * 60)]),
      getReceipts: vi.fn(async () => ({})),
    })
    const out = await checkPushReceipts(d, NOW)
    expect(d.deleteTickets).toHaveBeenCalledWith(['stale'])
    expect(out.ticketsRemoved).toBe(1)
  })
  it('asks for receipts in chunks of 1000', async () => {
    const many = Array.from({ length: 2500 }, (_, i) => ticket(`t${i}`, `tok${i}`, 20))
    const d = deps({ listDueTickets: vi.fn(async () => many) })
    await checkPushReceipts(d, NOW)
    const sizes = (d.getReceipts as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as string[]).length)
    expect(RECEIPT_CHUNK).toBe(1000)
    expect(sizes).toEqual([1000, 1000, 500])
  })
  it('a failing chunk keeps its tickets for the next run and does not stop the others', async () => {
    const many = Array.from({ length: 1500 }, (_, i) => ticket(`t${i}`, `tok${i}`, 20))
    let call = 0
    const d = deps({
      listDueTickets: vi.fn(async () => many),
      getReceipts: vi.fn(async (ids: string[]) => {
        if (call++ === 0) throw new Error('exp.host down')
        return Object.fromEntries(ids.map((id) => [id, { status: 'ok' as const }]))
      }),
    })
    const out = await checkPushReceipts(d, NOW)
    expect(out.ticketsRemoved).toBe(500)
    expect(d.deleteTickets).toHaveBeenCalledTimes(1)
  })
  it('no due tickets: nothing is requested', async () => {
    const d = deps()
    expect(await checkPushReceipts(d, NOW)).toEqual({ checked: 0, tokensRemoved: 0, ticketsRemoved: 0 })
    expect(d.getReceipts).not.toHaveBeenCalled()
  })
})

describe('supabaseReceiptDeps', () => {
  it('getReceipts posts the ids to Expo and returns the receipts by ticket id', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: { a: { status: 'ok' } } }) }) as Response)
    const out = await supabaseReceiptDeps({}, fetchFn as unknown as typeof fetch).getReceipts(['a', 'b'])
    expect(out).toEqual({ a: { status: 'ok' } })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://exp.host/--/api/v2/push/getReceipts')
    expect(JSON.parse(init.body as string)).toEqual({ ids: ['a', 'b'] })
  })
  it('getReceipts throws on a non-2xx answer', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }) as Response)
    await expect(supabaseReceiptDeps({}, fetchFn as unknown as typeof fetch).getReceipts(['a'])).rejects.toThrow('429')
  })
  describe('EXPO_ACCESS_TOKEN (Expo Enhanced Push Security)', () => {
    afterEach(() => { vi.unstubAllEnvs() })
    const ok = () => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: {} }) }) as Response)
    it('is sent as a Bearer header when set', async () => {
      vi.stubEnv('EXPO_ACCESS_TOKEN', 'secret-token')
      const f = ok()
      await supabaseReceiptDeps({}, f as unknown as typeof fetch).getReceipts(['a'])
      expect(((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>).authorization).toBe('Bearer secret-token')
    })
    it('is not sent when unset', async () => {
      vi.stubEnv('EXPO_ACCESS_TOKEN', '')
      const f = ok()
      await supabaseReceiptDeps({}, f as unknown as typeof fetch).getReceipts(['a'])
      expect(((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>).authorization).toBeUndefined()
    })
  })
})
