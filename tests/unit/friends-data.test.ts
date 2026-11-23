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

describe('friendStreaks', () => {
  test('only the first STREAK_FRIENDS_MAX friends are queried', async () => {
    const ids = Array.from({ length: STREAK_FRIENDS_MAX + 10 }, (_, i) => `f${i}`)
    const f = fakeSupabase(() => ({ data: [] }))
    const out = await friendStreaks(f.client, ids, TODAY)
    const habitsQuery = f.queries.find((q) => q.table === 'habits')!
    expect(args(habitsQuery, 'in')[0][1]).toHaveLength(STREAK_FRIENDS_MAX)
    expect(out.has(`f${STREAK_FRIENDS_MAX}`)).toBe(false)
  })

  test('a streak that fills the window is flagged as capped', async () => {
    const f = fakeSupabase((q) =>
      q.table === 'habits'
        ? { data: [{ id: 'h1', user_id: 'f1', frequency_type: 'daily', target_per_week: null }] }
        : { data: Array.from({ length: LIST_STREAK_DAYS + 1 }, (_, i) => ({ id: `c${i}`, habit_id: 'h1', local_date: day(i) })) },
    )
    const out = await friendStreaks(f.client, ['f1'], TODAY)
    expect(out.get('f1')).toMatchObject({ unit: 'days', capped: true })
    expect(out.get('f1')!.value).toBeGreaterThanOrEqual(LIST_STREAK_DAYS)
  })

  test('a short streak is exact', async () => {
    const f = fakeSupabase((q) =>
      q.table === 'habits'
        ? { data: [{ id: 'h1', user_id: 'f1', frequency_type: 'daily', target_per_week: null }] }
        : { data: [0, 1, 2].map((i) => ({ id: `c${i}`, habit_id: 'h1', local_date: day(i) })) },
    )
    const out = await friendStreaks(f.client, ['f1'], TODAY)
    expect(out.get('f1')).toEqual({ value: 3, unit: 'days', capped: false })
  })

  test('errors are not swallowed (the page decides to show no status line)', async () => {
    const f = fakeSupabase(() => ({ data: null, error: { message: 'boom' } }))
    await expect(friendStreaks(f.client, ['f1'], TODAY)).rejects.toThrow('boom')
  })
})
