import { describe, expect, test, vi } from 'vitest'
import { args, fakeSupabase } from './support/fake-supabase'

vi.mock('server-only', () => ({}))
const { loadFeedPage } = await import('@/lib/activity-feed')

const ME = '11111111-1111-4111-8111-111111111111'
const FRIEND = '22222222-2222-4222-8222-222222222222'
const ROW = {
  id: '33333333-3333-4333-8333-333333333333',
  user_id: FRIEND,
  habit_id: 'h1',
  local_date: '2026-11-21',
  created_at: '2026-11-21T10:00:00.000Z',
  photo_path: null,
  rejected_at: null,
  rejected_by: null,
  habits: { name: 'Correr', color: 'sage', frequency_type: 'daily', target_per_week: null },
}

async function run(opts: Partial<Parameters<typeof loadFeedPage>[2]>, rows: unknown[] = [ROW]) {
  const f = fakeSupabase((q) => {
    // the feed query is the one that selects rejected_by
    const select = String(q.calls.find((c) => c.method === 'select')?.args[0] ?? '')
    return { data: q.table === 'checkins' && select.includes('rejected_by') ? rows : [] }
  })
  const page = await loadFeedPage(f.client, ME, { now: new Date('2026-11-22T12:00:00Z'), ...opts, timezone: 'UTC' })
  const main = f.queries.find((q) => q.table === 'checkins')!
  return { page, main }
}

describe('loadFeedPage: rejected check-ins', () => {
  test('feed (no owner): only mine-rejected or non-rejected rows', async () => {
    const { main } = await run({})
    expect(args(main, 'neq')).toEqual([['user_id', ME]])
    expect(args(main, 'or')).toEqual([[`and(or(rejected_at.is.null,rejected_by.eq.${ME}))`]])
  })

  test("a friend's profile (owner = friend) applies the same rule", async () => {
    const { main } = await run({ owner: FRIEND })
    expect(args(main, 'eq')).toEqual([['user_id', FRIEND]])
    expect(args(main, 'or')).toEqual([[`and(or(rejected_at.is.null,rejected_by.eq.${ME}))`]])
  })

  test('the owner viewing their own check-ins sees every row (no rejected filter)', async () => {
    const { main } = await run({ owner: ME })
    expect(args(main, 'or')).toEqual([])
  })
})

describe('loadFeedPage: cursor and paging', () => {
  test('cursor adds the strict keyset condition next to the rejected one', async () => {
    const cursor = { day: '2026-11-21', at: '2026-11-21T10:00:00.000Z', id: ROW.id }
    const { main } = await run({ cursor })
    const [[expr]] = args(main, 'or') as [[string]]
    expect(expr).toContain('and(or(rejected_at.is.null')
    expect(expr).toContain(`local_date.lt.${cursor.day}`)
    expect(expr).toContain(`id.lt.${cursor.id}`)
  })

  test('orders newest first and asks for limit + 1 to know if there is more', async () => {
    const { main } = await run({ limit: 5 })
    expect(args(main, 'order').map((a) => a[0])).toEqual(['local_date', 'created_at', 'id'])
    expect(args(main, 'limit')).toEqual([[6]])
  })

  test('photos filter requires a photo path', async () => {
    const { main } = await run({ filter: 'photos' })
    expect(args(main, 'not')).toEqual([['photo_path', 'is', null]])
  })

  test('returns next cursor only when there is a row beyond the limit', async () => {
    const second = { ...ROW, id: '44444444-4444-4444-8444-444444444444', created_at: '2026-11-21T09:00:00.000Z' }
    const { page } = await run({ limit: 1 }, [ROW, second])
    expect(page.items).toHaveLength(1)
    expect(page.next).toEqual({ day: ROW.local_date, at: ROW.created_at, id: ROW.id })
    const last = await run({ limit: 2 }, [ROW, second])
    expect(last.page.next).toBeNull()
  })
})
