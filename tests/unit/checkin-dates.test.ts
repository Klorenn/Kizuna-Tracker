import { describe, expect, test } from 'vitest'
import { DATES_CHUNK, loadCheckinDates } from '@/lib/checkin-dates'
import { fakeSupabase } from './support/fake-supabase'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `h${i}`)
const params = (q: { calls: { args: unknown[] }[] }) => q.calls[0].args[0] as { p_habit_ids: string[]; p_from: string }

describe('loadCheckinDates', () => {
  test('one call for a small list, mapped by habit', async () => {
    const f = fakeSupabase(() => ({ data: [{ habit_id: 'h1', dates: ['2026-11-22'] }] }))
    const r = await loadCheckinDates(f.client, ['h1', 'h2'], '2026-01-01')
    expect(r).toEqual({ ok: true, byHabit: new Map([['h1', ['2026-11-22']]]) })
    expect(f.queries.map((q) => q.table)).toEqual(['rpc:checkin_dates'])
    expect(params(f.queries[0])).toEqual({ p_habit_ids: ['h1', 'h2'], p_from: '2026-01-01' })
  })

  test('an empty list makes no call', async () => {
    const f = fakeSupabase(() => ({ data: [] }))
    expect(await loadCheckinDates(f.client, [], '2026-01-01')).toEqual({ ok: true, byHabit: new Map() })
    expect(f.queries).toHaveLength(0)
  })

  test('more than the cap is split in chunks and merged (never one oversized call)', async () => {
    const f = fakeSupabase((q) => ({ data: params(q).p_habit_ids.map((habit_id) => ({ habit_id, dates: ['2026-11-22'] })) }))
    const r = await loadCheckinDates(f.client, ids(1200), '2026-01-01')
    expect(f.queries.map((q) => params(q).p_habit_ids.length)).toEqual([500, 500, 200])
    expect(DATES_CHUNK).toBe(500)
    expect(r.ok && r.byHabit.size).toBe(1200)
  })

  test('duplicated ids are sent once', async () => {
    const f = fakeSupabase(() => ({ data: [] }))
    await loadCheckinDates(f.client, ['a', 'a', 'b'], '2026-01-01')
    expect(params(f.queries[0]).p_habit_ids).toEqual(['a', 'b'])
  })

  test('a failed call fails the whole read, even when another chunk succeeded', async () => {
    let n = 0
    const f = fakeSupabase(() => (n++ === 1 ? { data: null, error: { message: 'boom' } } : { data: [] }))
    expect(await loadCheckinDates(f.client, ids(1200), '2026-01-01')).toEqual({ ok: false })
  })
})
