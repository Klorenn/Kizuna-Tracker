import { describe, expect, test, vi } from 'vitest'
import { F1, FIXTURE, ME, NOW, feedClient } from './support/feed-fixture'

vi.mock('server-only', () => ({}))
const { loadFeedPage } = await import('@/lib/activity-feed')

/**
 * Characterization: the feed output for a fixed data set (streaks, item habits, a rejected row, a
 * deleted profile, a missing habit, a photo under review). Captured from the table-query
 * implementation, it must stay identical after the reads move to the friend_feed RPC.
 */
const load = (opts: Partial<Parameters<typeof loadFeedPage>[2]> = {}) => {
  const f = feedClient()
  return loadFeedPage(f.client, ME, { timezone: 'America/Santiago', now: NOW, ...opts }).then((page) => ({ page, ...f }))
}

describe('loadFeedPage output (characterization)', () => {
  test('the whole first page: same items, order and fields', async () => {
    const { page } = await load()
    expect(page).toMatchSnapshot()
  })

  test('order is newest first by (day, time, id) whatever the read returns', async () => {
    const { page } = await load()
    expect(page.items.map((i) => i.id)).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`))
  })

  test('limit 3 returns three items and the cursor of the third', async () => {
    const { page } = await load({ limit: 3 })
    expect(page.items).toHaveLength(3)
    expect(page.next).toEqual({ day: '2026-11-21', at: '2026-11-21T20:00:00.000Z', id: page.items[2].id })
  })

  test('photos filter keeps only photo rows (with the signed url)', async () => {
    const { page } = await load({ filter: 'photos' })
    expect(page.items.map((i) => [i.hasPhoto, i.photoUrl])).toEqual([[true, expect.stringContaining('https://signed.test/')]])
  })

  test("a friend's profile feed (owner) holds only that friend", async () => {
    const { page } = await load({ owner: F1, limit: 10 })
    expect(new Set(page.items.map((i) => i.person.id))).toEqual(new Set([F1]))
    expect(page.items).toHaveLength(4)
  })

  test('an empty feed is an empty page', async () => {
    const f = feedClient({ ...FIXTURE, visible: [] })
    expect(await loadFeedPage(f.client, ME, { timezone: 'UTC', now: NOW })).toEqual({ items: [], next: null })
  })
})
