import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { claimReminders, loadReminderCandidates } from '@/lib/reminders-repo'

type Row = { user_id: string; timezone: string; reminder_time: string; pending_today: boolean }

/** Fake service-role client: `reminder_candidates` answers like PostgREST, capped at 1000 rows. */
function fakeDb(rows: Row[]) {
  const calls: { fn: string; order?: string; range?: [number, number] }[] = []
  const db = {
    rpc(fn: string) {
      const call: (typeof calls)[number] = { fn }
      calls.push(call)
      const builder = {
        order(col: string) {
          call.order = col
          return builder
        },
        range(from: number, to: number) {
          call.range = [from, to]
          return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null })
        },
      }
      return builder
    },
  }
  return { db: db as unknown as Parameters<typeof loadReminderCandidates>[0], calls }
}

describe('loadReminderCandidates', () => {
  it('reads every candidate from the SQL function, past the 1000-row cap', async () => {
    const rows: Row[] = Array.from({ length: 1500 }, (_, i) => ({
      user_id: `u${i}`,
      timezone: 'America/Santiago',
      reminder_time: '20:00:00',
      pending_today: i % 2 === 0,
    }))
    const { db, calls } = fakeDb(rows)
    const out = await loadReminderCandidates(db)
    expect(out).toHaveLength(1500)
    expect(out[1]).toEqual({ id: 'u1', timezone: 'America/Santiago', reminderTime: '20:00:00', pendingToday: false })
    expect(calls.map((c) => c.fn)).toEqual(['reminder_candidates', 'reminder_candidates'])
    expect(calls.every((c) => c.order === 'user_id')).toBe(true)
    expect(calls.map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })
})

describe('claimReminders', () => {
  it('claims in batches so the returned winners are never cut at 1000 rows', async () => {
    const batches: number[] = []
    const db = {
      from: () => ({
        upsert: (rows: { user_id: string }[]) => ({
          select: async () => {
            batches.push(rows.length)
            return { data: rows.slice(0, 1000).map((r) => ({ user_id: r.user_id })), error: null }
          },
        }),
      }),
    } as unknown as Parameters<typeof claimReminders>[0]
    const due = Array.from({ length: 1200 }, (_, i) => ({ id: `u${i}`, localDate: '2026-11-22' }))
    const won = await claimReminders(db, due)
    expect(won).toHaveLength(1200)
    expect(batches.every((n) => n <= 500)).toBe(true)
  })
})
