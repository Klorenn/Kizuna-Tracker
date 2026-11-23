import { describe, expect, test, vi } from 'vitest'
import { args, fakeSupabase, type Recorded } from './support/fake-supabase'

vi.mock('server-only', () => ({}))
const { loadFriendProfile } = await import('@/lib/friend-profile-data')

const ME = '11111111-1111-4111-8111-111111111111'
const FRIEND = '22222222-2222-4222-8222-222222222222'
const TODAY = '2026-11-22'

const PUBLIC = { id: 'h-public', name: 'Correr', color: 'sage', frequency_type: 'daily', target_per_week: null, visibility: 'friends' }
const PRIVATE = { id: 'h-private', name: 'Secreto', color: 'sage', frequency_type: 'daily', target_per_week: null, visibility: 'private' }

const select = (q: Recorded) => String(q.calls.find((c) => c.method === 'select')?.args[0] ?? '')

type Over = Partial<Record<'habits' | 'challenges' | 'debts' | 'feed', { data: unknown; error?: { message: string } }>>

function load(over: Over = {}) {
  const f = fakeSupabase((q) => {
    const s = select(q)
    if (q.table === 'habits' && s.includes('visibility')) return over.habits ?? { data: [PUBLIC, PRIVATE] }
    if (q.table === 'challenges') return over.challenges ?? { data: [] }
    if (q.table === 'debts') return over.debts ?? { data: [] }
    if (q.table === 'checkins' && s.includes('rejected_by')) return over.feed ?? { data: [] }
    return { data: [] }
  })
  return loadFriendProfile(f.client, ME, FRIEND, TODAY, 'UTC').then((data) => ({ data, queries: f.queries }))
}

describe('loadFriendProfile: what the friend view may contain', () => {
  test('private habits never reach the view, even if a row slips past the query', async () => {
    const { data, queries } = await load()
    const habitsQuery = queries.find((q) => q.table === 'habits')!
    expect(args(habitsQuery, 'neq')).toEqual([['visibility', 'private']])
    expect(args(habitsQuery, 'eq')).toEqual([['user_id', FRIEND]])
    expect(data.habits.map((h) => h.id)).toEqual(['h-public'])
    // and no history is read for the private one
    const history = queries.filter((q) => q.table === 'checkins' && args(q, 'eq').some((a) => a[0] === 'habit_id'))
    expect(history.flatMap((q) => args(q, 'eq')).map((a) => a[1])).toEqual(['h-public'])
  })

  test('challenges and debts are limited to the pair (me and the friend), both directions', async () => {
    const { queries } = await load()
    const [[ch]] = args(queries.find((q) => q.table === 'challenges')!, 'or') as [[string]]
    expect(ch).toBe(
      `and(creator_id.eq.${ME},rival_id.eq.${FRIEND}),and(creator_id.eq.${FRIEND},rival_id.eq.${ME})`,
    )
    const [[debt]] = args(queries.find((q) => q.table === 'debts')!, 'or') as [[string]]
    expect(debt).toBe(
      `and(debtor_id.eq.${ME},creditor_id.eq.${FRIEND}),and(debtor_id.eq.${FRIEND},creditor_id.eq.${ME})`,
    )
  })

  test("the latest check-ins are the friend's own, with the rejected-visibility rule", async () => {
    const { queries } = await load()
    const feed = queries.find((q) => q.table === 'checkins' && select(q).includes('rejected_by'))!
    expect(args(feed, 'eq')).toEqual([['user_id', FRIEND]])
    expect(args(feed, 'or')).toEqual([[`and(or(rejected_at.is.null,rejected_by.eq.${ME}))`]])
  })

  test('a challenge with someone else never appears (only the pair rows come back)', async () => {
    const mine = {
      id: 'c1', creator_id: ME, rival_id: FRIEND, creator_habit_id: 'a', rival_habit_id: 'b',
      status: 'active', frequency_type: 'daily', target_per_week: null, weeks: 4, starts_on: '2026-11-16',
      cancel_requested_by: null, created_at: '2026-11-15T00:00:00Z',
    }
    const { data } = await load({ challenges: { data: [mine] } })
    expect(data.challenges.map((c) => c.id)).toEqual(['c1'])
    expect(data.failed).toEqual([])
  })
})

describe('loadFriendProfile: a transient error degrades one section, not the page', () => {
  test('challenges fail: habits and latest still load, the section is flagged', async () => {
    const { data } = await load({ challenges: { data: null, error: { message: 'boom' } } })
    expect(data.failed).toEqual(['challenges'])
    expect(data.habits.map((h) => h.id)).toEqual(['h-public'])
    expect(data.challenges).toEqual([])
  })

  test('habits fail: flagged, the rest still loads', async () => {
    const { data } = await load({ habits: { data: null, error: { message: 'boom' } } })
    expect(data.failed).toEqual(['habits'])
    expect(data.habits).toEqual([])
  })

  test('the latest check-ins fail: flagged', async () => {
    const { data } = await load({ feed: { data: null, error: { message: 'boom' } } })
    expect(data.failed).toEqual(['latest'])
  })
})
