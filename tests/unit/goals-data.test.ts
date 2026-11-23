import { describe, expect, test } from 'vitest'
import { loadGoals } from '@/lib/goals-data'
import { fakeSupabase } from './support/fake-supabase'

const TODAY = '2026-11-25' // Wednesday; the week runs Monday 2026-11-23 to Sunday 2026-11-29

const GOALS = [
  { id: 'g-week', habit_id: 'h1', kind: 'weekly', target: 4, starts_on: '2026-11-01', deadline: null, created_at: '2026-11-01T00:00:00Z' },
  { id: 'g-total', habit_id: 'h1', kind: 'total', target: 100, starts_on: '2026-10-01', deadline: '2026-12-31', created_at: '2026-11-02T00:00:00Z' },
  { id: 'g-open', habit_id: 'h2', kind: 'total', target: 10, starts_on: '2026-11-10', deadline: null, created_at: '2026-11-03T00:00:00Z' },
]
const HABITS = [
  { id: 'h1', name: 'Correr', color: 'sage' },
  { id: 'h2', name: 'Leer', color: 'indigo' },
]
// h1: two days this week, plus October and early November days; h2: one day before its goal started, two after
const DATES = [
  { habit_id: 'h1', dates: ['2026-11-25', '2026-11-23', '2026-11-20', '2026-10-15', '2026-09-30'] },
  { habit_id: 'h2', dates: ['2026-11-24', '2026-11-12', '2026-11-05'] },
]

function load(over: { dates?: { data: unknown; error?: { message: string } }; goals?: unknown[] } = {}) {
  const f = fakeSupabase((q) => {
    if (q.table === 'goals') return { data: over.goals ?? GOALS }
    if (q.table === 'habits') return { data: HABITS }
    if (q.table === 'rpc:checkin_dates') return over.dates ?? { data: DATES }
    return { data: [] }
  })
  return loadGoals(f.client, 'me', TODAY).then((views) => ({ views, queries: f.queries }))
}

describe('loadGoals', () => {
  test('progress is counted per goal window from one checkin_dates call (not one count per goal)', async () => {
    const { views, queries } = await load()
    expect(queries.filter((q) => q.table === 'rpc:checkin_dates')).toHaveLength(1)
    expect(queries.filter((q) => q.table === 'checkins')).toEqual([])
    const byId = new Map(views.map((v) => [v.id, v]))
    // weekly: only the dates inside Monday-Sunday of this week
    expect(byId.get('g-week')).toMatchObject({ current: 2, target: 4, status: 'in_progress' })
    // total with a deadline: from starts_on to the deadline (Sep 30 is before it started)
    expect(byId.get('g-total')).toMatchObject({ current: 4, target: 100 })
    // total without a deadline: from starts_on to today
    expect(byId.get('g-open')).toMatchObject({ current: 2, target: 10 })
  })

  test('asks for dates from the earliest window start of the habits that have goals', async () => {
    const { queries } = await load()
    const call = queries.find((q) => q.table === 'rpc:checkin_dates')!
    expect(call.calls[0].args[0]).toEqual({ p_habit_ids: ['h1', 'h2'], p_from: '2026-10-01' })
  })

  test('a weekly-only list asks only for this week', async () => {
    const { queries } = await load({ goals: [GOALS[0]] })
    expect(queries.find((q) => q.table === 'rpc:checkin_dates')!.calls[0].args[0]).toEqual({ p_habit_ids: ['h1'], p_from: '2026-11-23' })
  })

  test('no goals: no history read at all', async () => {
    const { views, queries } = await load({ goals: [] })
    expect(views).toEqual([])
    expect(queries.some((q) => q.table === 'rpc:checkin_dates')).toBe(false)
  })

  test('a habit without check-ins counts zero', async () => {
    const { views } = await load({ dates: { data: [] } })
    expect(views.map((v) => v.current)).toEqual([0, 0, 0])
  })

  test('a failed history read counts as zero, like the per-goal counts did', async () => {
    const { views } = await load({ dates: { data: null, error: { message: 'boom' } } })
    expect(views.map((v) => v.current)).toEqual([0, 0, 0])
  })

  test('weekly goals come first', async () => {
    const { views } = await load()
    expect(views[0].kind).toBe('weekly')
  })
})
