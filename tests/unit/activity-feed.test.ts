import { describe, expect, test, vi } from 'vitest'
import { F1, FIXTURE, ME, NOW, feedClient } from './support/feed-fixture'

vi.mock('server-only', () => ({}))
const { loadFeedPage } = await import('@/lib/activity-feed')

async function run(opts: Partial<Parameters<typeof loadFeedPage>[2]> = {}, db = FIXTURE) {
  const f = feedClient(db)
  const page = await loadFeedPage(f.client, ME, { now: NOW, ...opts, timezone: 'UTC' })
  const feed = f.rpcCalls.find((c) => c.name === 'friend_feed')!
  return { page, feed, ...f }
}

describe('loadFeedPage: one friend_feed call carries visibility, rejected rule and keyset', () => {
  test('feed (no owner): no owner argument, visibility stays in the database', async () => {
    const { feed } = await run()
    expect(feed.params.p_owner).toBeUndefined()
    expect(feed.params.p_photos_only).toBe(false)
  })

  test("a friend's profile (owner = friend) passes the owner", async () => {
    const { feed } = await run({ owner: F1 })
    expect(feed.params.p_owner).toBe(F1)
  })

  test('the viewer own check-ins pass the owner too (the database lets them see every row)', async () => {
    const { feed } = await run({ owner: ME })
    expect(feed.params.p_owner).toBe(ME)
  })

  test('cursor is passed as the strict keyset condition', async () => {
    const cursor = { day: '2026-11-21', at: '2026-11-21T10:00:00.000Z', id: '00000000-0000-4000-8000-000000000009' }
    const { feed } = await run({ cursor })
    expect(feed.params).toMatchObject({ p_cursor_day: cursor.day, p_cursor_at: cursor.at, p_cursor_id: cursor.id })
  })

  test('asks for limit (the database returns one extra row to know if there is more)', async () => {
    const { feed } = await run({ limit: 5 })
    expect(feed.params.p_limit).toBe(5)
  })

  test('photos filter is passed on', async () => {
    const { feed } = await run({ filter: 'photos' })
    expect(feed.params.p_photos_only).toBe(true)
  })

  test('returns next cursor only when there is a row beyond the limit', async () => {
    const { page } = await run({ limit: 1 })
    expect(page.items).toHaveLength(1)
    expect(page.next).toEqual({ day: page.items[0].cursor.day, at: page.items[0].cursor.at, id: page.items[0].id })
    const last = await run({ limit: 7 })
    expect(last.page.next).toBeNull()
  })

  test('a failing read throws (the page shows the feed error state)', async () => {
    const bad = {
      rpc: () => ({ then: (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'boom' } }).then(r) }),
    } as never
    await expect(loadFeedPage(bad, ME, { timezone: 'UTC', now: NOW })).rejects.toThrow('boom')
  })
})

describe('loadFeedPage: round trips', () => {
  test('the main read, then everything else in one parallel batch (two levels, not four)', async () => {
    const { trips } = await run()
    expect(trips[0]).toBe('rpc:friend_feed')
    // no table read of the checkins feed, no per-habit or follow-up serial query
    expect(trips.filter((t) => t === 'checkins')).toEqual([])
    expect(trips.slice(1).sort()).toEqual(['challenges', 'checkin_items', 'habit_items', 'public_profiles', 'rpc:checkin_dates'].sort())
  })

  test('the streak history is one checkin_dates call for the habits on the page', async () => {
    const { rpcCalls } = await run()
    const dates = rpcCalls.filter((c) => c.name === 'checkin_dates')
    expect(dates).toHaveLength(1)
    expect((dates[0].params.p_habit_ids as string[]).sort()).toEqual(['h-gone', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
  })
})
