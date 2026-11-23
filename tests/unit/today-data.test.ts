import { describe, expect, test } from 'vitest'
import { DATES_CHUNK } from '@/lib/checkin-dates'
import { loadTodayData } from '@/lib/today-data'
import { args, fakeSupabase, type Recorded } from './support/fake-supabase'

const TODAY = '2026-11-25'
const habit = (id: string, log_type = 'none') => ({ id, name: id, log_type })

function load(over: { habits?: unknown[]; dates?: { data: unknown; error?: { message: string } } } = {}) {
  const f = fakeSupabase((q: Recorded) => {
    if (q.table === 'habits') return { data: over.habits ?? [habit('h1'), habit('h2')] }
    if (q.table === 'rpc:checkin_dates') return over.dates ?? { data: [{ habit_id: 'h1', dates: ['2026-11-25', '2026-11-24'] }] }
    return { data: [] }
  })
  return loadTodayData(f.client, 'me', TODAY).then((data) => ({ data, queries: f.queries }))
}

describe('loadTodayData', () => {
  test('the history of every habit is one checkin_dates call from 400 days back, not a paged read of checkins', async () => {
    const { data, queries } = await load()
    const rpc = queries.filter((q) => q.table === 'rpc:checkin_dates')
    expect(rpc).toHaveLength(1)
    expect(args(rpc[0], 'rpc')[0]).toEqual([{ p_habit_ids: ['h1', 'h2'], p_from: '2025-10-21' }])
    // the only checkins read left is today's (id + habit for the row links)
    const checkinReads = queries.filter((q) => q.table === 'checkins')
    expect(checkinReads).toHaveLength(1)
    expect(args(checkinReads[0], 'eq')).toContainEqual(['local_date', TODAY])
    expect(checkinReads[0].calls.some((c) => c.method === 'range')).toBe(false)
    expect(data.history).toEqual({
      ok: true,
      checkins: [
        { habit_id: 'h1', local_date: '2026-11-25' },
        { habit_id: 'h1', local_date: '2026-11-24' },
      ],
    })
  })

  test('a failed history read is reported, never turned into an empty history', async () => {
    const { data } = await load({ dates: { data: null, error: { message: 'boom' } } })
    expect(data.history).toEqual({ ok: false })
  })

  test('more than 500 habits go out in chunks, in the same round', async () => {
    const habits = Array.from({ length: DATES_CHUNK + 1 }, (_, i) => habit(`h${i}`))
    const { queries } = await load({ habits })
    expect(queries.filter((q) => q.table === 'rpc:checkin_dates')).toHaveLength(2)
  })

  test('no habits: no history call at all', async () => {
    const { data, queries } = await load({ habits: [] })
    expect(queries.some((q) => q.table === 'rpc:checkin_dates')).toBe(false)
    expect(data.history).toEqual({ ok: true, checkins: [] })
  })

  test('the series and movie titles are not read (the watch sheet loads them when it opens)', async () => {
    const { queries } = await load({ habits: [habit('w1', 'watch')] })
    expect(queries.some((q) => q.table === 'media_items')).toBe(false)
  })

  test('the books of the reading sheet load only when a reading habit exists, alongside the history', async () => {
    const without = await load()
    expect(without.queries.some((q) => q.table === 'books')).toBe(false)
    const withReading = await load({ habits: [habit('r1', 'reading'), habit('h2')] })
    expect(withReading.queries.some((q) => q.table === 'books')).toBe(true)
    expect(withReading.data.books).toEqual([])
  })
})
