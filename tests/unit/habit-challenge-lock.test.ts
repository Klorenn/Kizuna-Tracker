import { describe, expect, test } from 'vitest'
import { args, fakeSupabase } from './support/fake-supabase'
import { habitInOpenChallenge } from '@/lib/habit-challenge-lock'

const HABIT = 'h-1'

describe('habitInOpenChallenge', () => {
  test('reads challenge_items (any item of the habit, either side), live item of an open challenge', async () => {
    const f = fakeSupabase(() => ({ data: null, count: 1 }))
    expect(await habitInOpenChallenge(f.client, HABIT)).toBe(true)
    const q = f.queries[0]
    expect(q.table).toBe('challenge_items')
    const sel = q.calls.find((c) => c.method === 'select')!
    expect(sel.args[0]).toContain('challenges!inner(status)')
    expect(sel.args[1]).toEqual({ count: 'exact', head: true })
    expect(args(q, 'in')).toContainEqual(['status', ['proposed', 'active']])
    expect(args(q, 'in')).toContainEqual(['challenges.status', ['proposed', 'active']])
    expect(args(q, 'or')).toEqual([[`creator_habit_id.eq.${HABIT},rival_habit_id.eq.${HABIT}`]])
  })

  test('no live item: not locked', async () => {
    const f = fakeSupabase(() => ({ data: null, count: 0 }))
    expect(await habitInOpenChallenge(f.client, HABIT)).toBe(false)
  })

  test('a null count is not locked', async () => {
    const f = fakeSupabase(() => ({ data: null, count: null }))
    expect(await habitInOpenChallenge(f.client, HABIT)).toBe(false)
  })
})
