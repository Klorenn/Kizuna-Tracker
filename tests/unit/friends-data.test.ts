import { describe, expect, test, vi } from 'vitest'
import { args, fakeSupabase } from './support/fake-supabase'

vi.mock('server-only', () => ({}))
const { friendStreaks, STREAK_FRIENDS_MAX, LIST_STREAK_DAYS } = await import('@/lib/friends-data')

const TODAY = '2026-11-22'
const day = (back: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - back)
  return d.toISOString().slice(0, 10)
}

const streaks = (r: Awaited<ReturnType<typeof friendStreaks>>) => {
  if (!r.ok) throw new Error('expected ok')
  return r.streaks
}

describe('friendStreaks', () => {
  test('only the first STREAK_FRIENDS_MAX friends are queried', async () => {
    const ids = Array.from({ length: STREAK_FRIENDS_MAX + 10 }, (_, i) => `f${i}`)
    const f = fakeSupabase(() => ({ data: [] }))
    const out = await friendStreaks(f.client, ids, TODAY)
    const habitsQuery = f.queries.find((q) => q.table === 'habits')!
    expect(args(habitsQuery, 'in')[0][1]).toHaveLength(STREAK_FRIENDS_MAX)
    expect(streaks(out).has(`f${STREAK_FRIENDS_MAX}`)).toBe(false)
  })

  test('a streak that fills the window is flagged as capped', async () => {
    const f = fakeSupabase((q) =>
      q.table === 'habits'
        ? { data: [{ id: 'h1', user_id: 'f1', frequency_type: 'daily', target_per_week: null }] }
        : { data: [{ habit_id: 'h1', dates: Array.from({ length: LIST_STREAK_DAYS + 1 }, (_, i) => day(i)) }] },
    )
    const out = await friendStreaks(f.client, ['f1'], TODAY)
    expect(streaks(out).get('f1')).toMatchObject({ unit: 'days', capped: true })
    expect(streaks(out).get('f1')!.value).toBeGreaterThanOrEqual(LIST_STREAK_DAYS)
  })

  test('a short streak is exact', async () => {
    const f = fakeSupabase((q) =>
      q.table === 'habits'
        ? { data: [{ id: 'h1', user_id: 'f1', frequency_type: 'daily', target_per_week: null }] }
        : { data: [{ habit_id: 'h1', dates: [0, 1, 2].map(day) }] },
    )
    const out = await friendStreaks(f.client, ['f1'], TODAY)
    expect(streaks(out).get('f1')).toEqual({ value: 3, unit: 'days', capped: false })
  })

  test('the history of all their habits is one checkin_dates call, windowed to LIST_STREAK_DAYS', async () => {
    const f = fakeSupabase((q) =>
      q.table === 'habits'
        ? {
            data: [
              { id: 'h1', user_id: 'f1', frequency_type: 'daily', target_per_week: null },
              { id: 'h2', user_id: 'f2', frequency_type: 'daily', target_per_week: null },
            ],
          }
        : { data: [] },
    )
    await friendStreaks(f.client, ['f1', 'f2'], TODAY)
    const calls = f.queries.filter((q) => q.table === 'rpc:checkin_dates')
    expect(calls).toHaveLength(1)
    expect(calls[0].calls[0].args[0]).toEqual({ p_habit_ids: ['h1', 'h2'], p_from: day(LIST_STREAK_DAYS) })
    expect(f.queries.filter((q) => q.table === 'checkins')).toEqual([])
  })

  test('over 500 habits the history goes out in chunks and every habit keeps its dates', async () => {
    const all = Array.from({ length: 1200 }, (_, i) => ({ id: `h${i}`, user_id: 'f1', frequency_type: 'daily', target_per_week: null }))
    const f = fakeSupabase((q) => {
      if (q.table === 'habits') {
        const [from, to] = q.calls.find((c) => c.method === 'range')!.args as [number, number]
        return { data: all.slice(from, to + 1) }
      }
      const { p_habit_ids } = q.calls[0].args[0] as { p_habit_ids: string[] }
      return { data: p_habit_ids.map((habit_id) => ({ habit_id, dates: [day(0), day(1), day(2)] })) }
    })
    const out = await friendStreaks(f.client, ['f1'], TODAY)
    const sizes = f.queries.filter((q) => q.table === 'rpc:checkin_dates').map((q) => (q.calls[0].args[0] as { p_habit_ids: string[] }).p_habit_ids.length)
    expect(sizes).toEqual([500, 500, 200])
    expect(streaks(out).get('f1')).toMatchObject({ value: 3 })
  })

  test('a failed read is an explicit failure, not an empty status (never a false "Sin racha activa")', async () => {
    const f = fakeSupabase(() => ({ data: null, error: { message: 'boom' } }))
    expect(await friendStreaks(f.client, ['f1'], TODAY)).toEqual({ ok: false })
  })

  test('a failing history read is also an explicit failure', async () => {
    const f = fakeSupabase((q) =>
      q.table === 'habits'
        ? { data: [{ id: 'h1', user_id: 'f1', frequency_type: 'daily', target_per_week: null }] }
        : { data: null, error: { message: 'boom' } },
    )
    expect(await friendStreaks(f.client, ['f1'], TODAY)).toEqual({ ok: false })
  })

  test('no friends: ok with nothing, no reads', async () => {
    const f = fakeSupabase(() => ({ data: [] }))
    expect(await friendStreaks(f.client, [], TODAY)).toEqual({ ok: true, streaks: new Map() })
    expect(f.queries).toHaveLength(0)
  })
})
