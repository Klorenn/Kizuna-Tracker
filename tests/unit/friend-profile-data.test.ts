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

type Over = Partial<Record<'habits' | 'named' | 'challenges' | 'debts' | 'feed' | 'dates', { data: unknown; error?: { message: string } }>>

function load(over: Over = {}) {
  const f = fakeSupabase((q) => {
    const s = select(q)
    if (q.table === 'habits' && s.includes('visibility')) return over.habits ?? { data: [PUBLIC, PRIVATE] }
    if (q.table === 'habits') return over.named ?? { data: [] }
    if (q.table === 'challenges') return over.challenges ?? { data: [] }
    if (q.table === 'debts') return over.debts ?? { data: [] }
    if (q.table === 'rpc:friend_feed') return over.feed ?? { data: [] }
    if (q.table === 'rpc:checkin_dates') {
      if (over.dates) return over.dates
      const ids = (q.calls[0].args[0] as { p_habit_ids: string[] }).p_habit_ids
      return { data: ids.map((habit_id) => ({ habit_id, dates: ['2026-11-22', '2026-11-21'] })) }
    }
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
    // and no history is asked for the private one
    const history = queries.filter((q) => q.table === 'rpc:checkin_dates')
    expect(history.map((q) => (q.calls[0].args[0] as { p_habit_ids: string[] }).p_habit_ids)).toEqual([['h-public']])
  })

  test('the history of every habit is one checkin_dates call (not one query per habit)', async () => {
    const two = { ...PUBLIC, id: 'h-two', name: 'Leer' }
    const { data, queries } = await load({ habits: { data: [PUBLIC, two, PRIVATE] } })
    const calls = queries.filter((q) => q.table === 'rpc:checkin_dates')
    expect(calls).toHaveLength(1)
    expect(calls[0].calls[0].args[0]).toMatchObject({ p_habit_ids: ['h-public', 'h-two'] })
    expect(queries.filter((q) => q.table === 'checkins')).toEqual([])
    expect(data.habits.map((h) => h.week.filter((d) => d.done).length)).toEqual([2, 2])
  })

  test('a habit with no check-ins in the window still appears, with an empty history', async () => {
    const { data } = await load({ dates: { data: [] } })
    expect(data.habits).toHaveLength(1)
    expect(data.habits[0].streak.value).toBe(0)
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
    const feed = queries.find((q) => q.table === 'rpc:friend_feed')!
    expect(feed.calls[0].args[0]).toMatchObject({ p_owner: FRIEND, p_limit: 10 })
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

describe('loadFriendProfile: sub-retos in the shared challenges', () => {
  const base = {
    id: 'c1', creator_id: ME, rival_id: FRIEND, creator_habit_id: 'a', rival_habit_id: 'b',
    status: 'active', frequency_type: 'daily', target_per_week: null, weeks: 4, starts_on: '2026-11-16',
    cancel_requested_by: null, created_at: '2026-11-15T00:00:00Z',
  }
  const item = (position: number, status: string, creator: string, rival: string | null) => ({
    position, status, creator_habit_id: creator, rival_habit_id: rival,
  })
  const named = { data: [{ id: 'a', name: 'Gym' }, { id: 'b', name: 'Pesas' }, { id: 'c', name: 'Agua' }, { id: 'd', name: 'Beber' }] }

  test('the title is the first live item plus "+N sub-retos"; non live items do not count', async () => {
    const row = {
      ...base,
      challenge_items: [
        item(3, 'proposed', 'x', null),
        item(1, 'active', 'a', 'b'),
        item(2, 'active', 'c', 'd'),
        item(4, 'withdrawn', 'y', 'z'),
      ],
    }
    const { data } = await load({ challenges: { data: [row] }, named })
    expect(data.challenges[0].title).toBe('Gym vs Pesas +2 sub-retos')
  })

  test('the first item is the one shown even when it is the second to be listed', async () => {
    const row = { ...base, challenge_items: [item(2, 'active', 'c', 'd'), item(1, 'active', 'a', 'b')] }
    const { data } = await load({ challenges: { data: [row] }, named })
    expect(data.challenges[0].title).toBe('Gym vs Pesas +1 sub-reto')
  })

  test('as the rival, my habit is the rival side', async () => {
    const row = { ...base, creator_id: FRIEND, rival_id: ME, challenge_items: [item(1, 'active', 'a', 'b')] }
    const { data } = await load({ challenges: { data: [row] }, named })
    expect(data.challenges[0].title).toBe('Pesas vs Gym')
  })

  test('a challenge without items (legacy shape) keeps the legacy habit title', async () => {
    const { data } = await load({ challenges: { data: [base] }, named })
    expect(data.challenges[0].title).toBe('Gym vs Pesas')
  })

  test('items arrive embedded in the challenges read: no extra round trip, names read for every item habit', async () => {
    const row = { ...base, challenge_items: [item(1, 'active', 'a', 'b'), item(2, 'active', 'c', 'd')] }
    const { queries } = await load({ challenges: { data: [row] }, named })
    expect(select(queries.find((q) => q.table === 'challenges')!)).toContain('challenge_items(')
    expect(queries.filter((q) => q.table === 'challenge_items')).toEqual([])
    const names = queries.find((q) => q.table === 'habits' && !select(q).includes('visibility'))!
    expect(args(names, 'in')).toEqual([['id', ['a', 'b', 'c', 'd']]])
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

  test('the history read fails: the habits section is flagged', async () => {
    const { data } = await load({ dates: { data: null, error: { message: 'boom' } } })
    expect(data.failed).toEqual(['habits'])
  })

  test('the latest check-ins fail: flagged', async () => {
    const { data } = await load({ feed: { data: null, error: { message: 'boom' } } })
    expect(data.failed).toEqual(['latest'])
  })
})
