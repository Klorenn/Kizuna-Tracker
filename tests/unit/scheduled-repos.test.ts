import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { claimNotifications } from '@/lib/notification-log-repo'
import { loadNotificationTargets } from '@/lib/notification-targets-repo'

describe('loadNotificationTargets', () => {
  it('pages the SQL function in a stable order, past the 1000-row cap', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({ user_id: `u${i}`, timezone: 'America/Santiago' }))
    const calls: { fn: string; args: unknown; order?: string; range?: [number, number] }[] = []
    const db = {
      rpc(fn: string, args: unknown) {
        const call: (typeof calls)[number] = { fn, args }
        calls.push(call)
        const b = {
          order(col: string) {
            call.order = col
            return b
          },
          range(from: number, to: number) {
            call.range = [from, to]
            return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null })
          },
        }
        return b
      },
    } as unknown as Parameters<typeof loadNotificationTargets>[0]
    const out = await loadNotificationTargets(db, 'weekly_summary')
    expect(out).toHaveLength(1200)
    expect(out[0]).toEqual({ id: 'u0', timezone: 'America/Santiago' })
    expect(calls.every((c) => c.fn === 'notification_targets' && c.order === 'user_id')).toBe(true)
    expect(calls[0].args).toEqual({ p_kind: 'weekly_summary' })
    expect(calls.map((c) => c.range)).toEqual([[0, 999], [1000, 1999]])
  })
})

describe('claimNotifications', () => {
  it('claims per kind, in batches, keyed on user + kind + local date', async () => {
    const batches: number[] = []
    let conflict = ''
    let table = ''
    const db = {
      from: (t: string) => {
        table = t
        return {
          upsert: (rows: { user_id: string; kind: string; local_date: string }[], opts: { onConflict: string }) => {
            conflict = opts.onConflict
            expect(rows.every((r) => r.kind === 'streak_risk')).toBe(true)
            return {
              select: async () => {
                batches.push(rows.length)
                return { data: rows.map((r) => ({ user_id: r.user_id })), error: null }
              },
            }
          },
        }
      },
    } as unknown as Parameters<typeof claimNotifications>[0]
    const entries = Array.from({ length: 1200 }, (_, i) => ({ id: `u${i}`, localDate: '2026-11-22' }))
    const won = await claimNotifications(db, 'streak_risk', entries)
    expect(won).toHaveLength(1200)
    expect(batches.every((n) => n <= 500)).toBe(true)
    expect(table).toBe('notification_log')
    expect(conflict).toBe('user_id,kind,local_date')
  })
  it('throws on a database error instead of pretending nobody won', async () => {
    const db = { from: () => ({ upsert: () => ({ select: async () => ({ data: null, error: { message: 'boom' } }) }) }) } as unknown as Parameters<typeof claimNotifications>[0]
    await expect(claimNotifications(db, 'weekly_summary', [{ id: 'u', localDate: '2026-11-22' }])).rejects.toBeTruthy()
  })
})
