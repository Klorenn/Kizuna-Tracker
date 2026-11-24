import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createClosePeriodsRepo } from '@/lib/close-periods-repo'

type Call = { method: string; args: unknown[] }

/** A chainable, thenable stand-in for a supabase-js query builder that records every call. */
function builder(result: { data: unknown; error: { message: string } | null }, calls: Call[]) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'or', 'is', 'not', 'order', 'range', 'eq', 'upsert', 'in', 'gte', 'lte']) {
    b[m] = (...args: unknown[]) => {
      calls.push({ method: m, args })
      return b
    }
  }
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return b
}

function fakeDb(tables: Record<string, { data: unknown; error?: { message: string } | null }>) {
  const calls: Record<string, Call[]> = {}
  const db = {
    from: (table: string) => {
      calls[table] ??= []
      const r = tables[table] ?? { data: [] }
      return builder({ data: r.data, error: r.error ?? null }, calls[table])
    },
  }
  return { db: db as never, calls }
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'ch1',
  creator_id: 'u1',
  rival_id: 'u2',
  frequency_type: 'weekly',
  weeks: 4,
  fine_amount: 4500,
  starts_on: '2026-11-23',
  timezone: 'America/Santiago',
  cancelled_at: null,
  challenge_items: [
    { id: 'i1', creator_habit_id: 'hc1', rival_habit_id: 'hr1', target_per_week: 3, requires_photo: false, starts_on: '2026-11-23', status: 'active' },
    { id: 'i2', creator_habit_id: 'hc2', rival_habit_id: 'hr2', target_per_week: 5, requires_photo: true, starts_on: '2026-11-30', status: 'active' },
  ],
  ...over,
})

describe('createClosePeriodsRepo.activeChallenges', () => {
  it('maps challenges with their active items (frequency from the challenge type + each item target)', async () => {
    const { db } = fakeDb({ challenges: { data: [row()] } })
    const [c] = await createClosePeriodsRepo(db).activeChallenges()
    expect(c).toEqual({
      id: 'ch1',
      creatorId: 'u1',
      rivalId: 'u2',
      frequencyType: 'weekly',
      weeks: 4,
      fineAmount: 4500,
      startsOn: '2026-11-23',
      timezone: 'America/Santiago',
      cancelledAt: null,
      items: [
        { id: 'i1', creatorHabitId: 'hc1', rivalHabitId: 'hr1', frequency: { type: 'weekly', target: 3 }, requiresPhoto: false, startsOn: '2026-11-23' },
        { id: 'i2', creatorHabitId: 'hc2', rivalHabitId: 'hr2', frequency: { type: 'weekly', target: 5 }, requiresPhoto: true, startsOn: '2026-11-30' },
      ],
    })
  })

  it('daily challenges give daily items whatever the item target says', async () => {
    const { db } = fakeDb({
      challenges: {
        data: [row({ frequency_type: 'daily', challenge_items: [{ id: 'i1', creator_habit_id: 'a', rival_habit_id: 'b', target_per_week: null, requires_photo: false, starts_on: '2026-11-23', status: 'active' }] })],
      },
    })
    const [c] = await createClosePeriodsRepo(db).activeChallenges()
    expect(c.items[0].frequency).toEqual({ type: 'daily' })
  })

  it('a weekly item without a target falls back to 1', async () => {
    const { db } = fakeDb({
      challenges: { data: [row({ challenge_items: [{ id: 'i1', creator_habit_id: 'a', rival_habit_id: 'b', target_per_week: null, requires_photo: false, starts_on: '2026-11-23', status: 'active' }] })] },
    })
    const [c] = await createClosePeriodsRepo(db).activeChallenges()
    expect(c.items[0].frequency).toEqual({ type: 'weekly', target: 1 })
  })

  it('embeds only ACTIVE items (inner join) and no longer filters on the legacy rival_habit_id', async () => {
    const { db, calls } = fakeDb({ challenges: { data: [] } })
    await createClosePeriodsRepo(db).activeChallenges()
    const select = calls.challenges.find((x) => x.method === 'select')!.args[0] as string
    expect(select).toContain('challenge_items!inner(')
    expect(calls.challenges).toContainEqual({ method: 'eq', args: ['challenge_items.status', 'active'] })
    expect(calls.challenges.some((x) => x.method === 'not' && x.args[0] === 'rival_habit_id')).toBe(false)
    expect(calls.challenges).toContainEqual({ method: 'not', args: ['starts_on', 'is', null] })
  })

  it('skips an item that is missing a side or its start (cannot be evaluated), keeps the rest', async () => {
    const { db } = fakeDb({
      challenges: {
        data: [
          row({
            challenge_items: [
              { id: 'bad', creator_habit_id: 'a', rival_habit_id: null, target_per_week: 2, requires_photo: false, starts_on: '2026-11-23', status: 'active' },
              { id: 'ok', creator_habit_id: 'a', rival_habit_id: 'b', target_per_week: 2, requires_photo: false, starts_on: '2026-11-23', status: 'active' },
            ],
          }),
        ],
      },
    })
    const [c] = await createClosePeriodsRepo(db).activeChallenges()
    expect(c.items.map((i) => i.id)).toEqual(['ok'])
  })

  it('a challenge with a null start or no items is not returned', async () => {
    const { db } = fakeDb({ challenges: { data: [row({ starts_on: null }), row({ id: 'ch2', challenge_items: [] })] } })
    expect(await createClosePeriodsRepo(db).activeChallenges()).toEqual([])
  })

  it('throws on a read error instead of acting on a partial list', async () => {
    const { db } = fakeDb({ challenges: { data: null, error: { message: 'boom' } } })
    await expect(createClosePeriodsRepo(db).activeChallenges()).rejects.toThrow('activeChallenges: boom')
  })
})

describe('createClosePeriodsRepo.insertItemResults', () => {
  const rows = [{ challengeId: 'ch1', periodStart: '2026-11-23', itemId: 'i1', playerId: 'u1', met: true, done: 3, needed: 3 }]

  it('upserts insert-if-absent on the unique key, with snake_case columns', async () => {
    const { db, calls } = fakeDb({ challenge_item_results: { data: [] } })
    await createClosePeriodsRepo(db).insertItemResults(rows)
    const up = calls.challenge_item_results.find((x) => x.method === 'upsert')!
    expect(up.args[0]).toEqual([{ challenge_id: 'ch1', period_start: '2026-11-23', item_id: 'i1', player_id: 'u1', met: true, done: 3, needed: 3 }])
    expect(up.args[1]).toEqual({ onConflict: 'challenge_id,period_start,item_id,player_id', ignoreDuplicates: true })
  })

  it('does nothing for an empty list', async () => {
    const { db, calls } = fakeDb({})
    await createClosePeriodsRepo(db).insertItemResults([])
    expect(calls.challenge_item_results).toBeUndefined()
  })

  it('throws on a write error', async () => {
    const { db } = fakeDb({ challenge_item_results: { data: null, error: { message: 'nope' } } })
    await expect(createClosePeriodsRepo(db).insertItemResults(rows)).rejects.toThrow('insertItemResults: nope')
  })
})

/** A fake `checkins` table that honours .range() the way PostgREST does: never more than 1000 rows per request. */
function pagedChecks(total: number) {
  const ranges: [number, number][] = []
  const orders: string[] = []
  const all = Array.from({ length: total }, (_, n) => ({
    id: `k${n}`,
    habit_id: 'h1',
    local_date: '2026-11-23',
    created_at: '2026-11-24T10:00:00Z',
  }))
  const db = {
    from: () => {
      let r: [number, number] = [0, 999]
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'in', 'eq', 'is', 'not', 'gte', 'lte']) b[m] = () => b
      b.order = (col: string) => {
        orders.push(col)
        return b
      }
      b.range = (from: number, to: number) => {
        r = [from, to]
        ranges.push(r)
        return b
      }
      b.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: all.slice(r[0], Math.min(r[1] + 1, r[0] + 1000)), error: null }).then(resolve)
      return b
    },
  }
  return { db: db as never, ranges, orders }
}

describe('createClosePeriodsRepo reads past max_rows', () => {
  it('photoCheckins pages through more than 1000 rows, with a stable order ending in the id', async () => {
    const { db, ranges, orders } = pagedChecks(2300)
    const out = await createClosePeriodsRepo(db).photoCheckins(['h1'], '2026-11-23', '2026-12-20')
    expect(out).toHaveLength(2300)
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
    expect(orders.slice(0, 3)).toEqual(['habit_id', 'local_date', 'id'])
  })

  it('checkinDates pages through more than 1000 rows too', async () => {
    const { db, ranges } = pagedChecks(1500)
    const out = await createClosePeriodsRepo(db).checkinDates('h1', '2026-11-23', '2026-12-20')
    expect(out).toHaveLength(1500)
    expect(ranges).toEqual([[0, 999], [1000, 1999]])
  })
})
