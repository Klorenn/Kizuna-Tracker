import { describe, expect, test } from 'vitest'
import { DATES_CHUNK } from '@/lib/checkin-dates'
import { loadTodayData } from '@/lib/today-data'
import { args, fakeSupabase, type Recorded } from './support/fake-supabase'

const TODAY = '2026-11-25'
const NOW = new Date('2026-11-25T15:00:00Z') // 12:00 in Santiago
const SANTIAGO = Promise.resolve({ timezone: 'America/Santiago' })
const habit = (id: string, log_type = 'none') => ({ id, name: id, log_type })

function load(over: { habits?: unknown[]; dates?: { data: unknown; error?: { message: string } } } = {}) {
  const f = fakeSupabase((q: Recorded) => {
    if (q.table === 'habits') return { data: over.habits ?? [habit('h1'), habit('h2')] }
    if (q.table === 'rpc:checkin_dates') return over.dates ?? { data: [{ habit_id: 'h1', dates: ['2026-11-25', '2026-11-24'] }] }
    return { data: [] }
  })
  return loadTodayData(f.client, 'me', SANTIAGO, NOW).then((data) => ({ data, queries: f.queries }))
}

describe('loadTodayData', () => {
  test('the history of every habit is one checkin_dates call from a zone-free date (UTC minus 401 days), not a paged read of checkins', async () => {
    const { data, queries } = await load()
    const rpc = queries.filter((q) => q.table === 'rpc:checkin_dates')
    expect(rpc).toHaveLength(1)
    expect(args(rpc[0], 'rpc')[0]).toEqual([{ p_habit_ids: ['h1', 'h2'], p_from: '2025-10-20' }])
    // the only checkins read left is today's (id + habit for the row links)
    const checkinReads = queries.filter((q) => q.table === 'checkins')
    expect(checkinReads).toHaveLength(1)
    expect(args(checkinReads[0], 'eq')).toContainEqual(['local_date', TODAY])
    expect(checkinReads[0].calls.some((c) => c.method === 'range')).toBe(false)
    expect(data.ok && data.checkins).toEqual([
      { habit_id: 'h1', local_date: '2026-11-25' },
      { habit_id: 'h1', local_date: '2026-11-24' },
    ])
  })

  test('a failed history read is reported, never turned into an empty history', async () => {
    const { data } = await load({ dates: { data: null, error: { message: 'boom' } } })
    expect(data).toEqual({ ok: false })
  })

  test('more than 500 habits go out in chunks, in the same round', async () => {
    const habits = Array.from({ length: DATES_CHUNK + 1 }, (_, i) => habit(`h${i}`))
    const { queries } = await load({ habits })
    expect(queries.filter((q) => q.table === 'rpc:checkin_dates')).toHaveLength(2)
  })

  test('no habits: no history call at all', async () => {
    const { data, queries } = await load({ habits: [] })
    expect(queries.some((q) => q.table === 'rpc:checkin_dates')).toBe(false)
    expect(data.ok && data.checkins).toEqual([])
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
    expect(withReading.data.ok && withReading.data.books).toEqual([])
  })
})

describe('loadTodayData: serial depth and the zone-free window', () => {
  // 23:30 UTC on the 25th: already the 26th in Auckland (UTC+13), still the 25th in Los Angeles (UTC-8)
  const AT = new Date('2026-11-25T23:30:00Z')
  const run = (timezone: string, extra: string[] = []) => {
    const f = fakeSupabase((q: Recorded) => {
      if (q.table === 'habits') return { data: [habit('h1')] }
      if (q.table === 'rpc:checkin_dates') return { data: [{ habit_id: 'h1', dates: ['2026-11-26', '2026-11-25', '2025-10-22', '2025-10-21', '2025-10-20', ...extra] }] }
      return { data: [] }
    })
    return loadTodayData(f.client, 'me', Promise.resolve({ timezone }), AT).then((data) => ({ data, queries: f.queries }))
  }

  test('both sides of UTC ask the RPC for the same date, then keep exactly today minus 400 onwards', async () => {
    const east = await run('Pacific/Auckland') // today 2026-11-26: from 2025-10-22
    const west = await run('America/Los_Angeles') // today 2026-11-25: from 2025-10-21
    const from = (r: Awaited<ReturnType<typeof run>>) =>
      (args(r.queries.find((q) => q.table === 'rpc:checkin_dates')!, 'rpc')[0][0] as { p_from: string }).p_from
    expect(from(east)).toBe('2025-10-20')
    expect(from(west)).toBe('2025-10-20')
    const dates = (r: Awaited<ReturnType<typeof run>>) => (r.data.ok ? r.data.checkins.map((c) => c.local_date).sort() : null)
    expect(dates(east)).toEqual(['2025-10-22', '2026-11-25', '2026-11-26'])
    expect(dates(west)).toEqual(['2025-10-21', '2025-10-22', '2026-11-25', '2026-11-26'])
    expect(east.data.ok && east.data.today).toBe('2026-11-26')
    expect(west.data.ok && west.data.today).toBe('2026-11-25')
  })

  test('habits, items and the history start before the profile arrives; day reads wait for it', async () => {
    let release!: (p: { timezone: string }) => void
    const profile = new Promise<{ timezone: string }>((r) => (release = r))
    const f = fakeSupabase((q: Recorded) => (q.table === 'habits' ? { data: [habit('h1')] } : { data: [] }))
    const pending = loadTodayData(f.client, 'me', profile, AT)
    await new Promise((r) => setTimeout(r, 5))
    const started = f.queries.map((q) => q.table)
    expect(started).toEqual(expect.arrayContaining(['habits', 'habit_items', 'rpc:checkin_dates']))
    for (const t of ['checkin_items', 'checkins', 'reading_entries', 'quantity_entries']) expect(started).not.toContain(t)
    release({ timezone: 'America/Santiago' })
    expect((await pending).ok).toBe(true)
  })

  test('a missing profile row is reported, not a retry state', async () => {
    const f = fakeSupabase(() => ({ data: [] }))
    expect(await loadTodayData(f.client, 'me', Promise.resolve(null), AT)).toEqual({ ok: false, missingProfile: true })
  })
})

describe('loadTodayData: a failed read is an error state, never a partial Hoy', () => {
  const fail = (table: string) => {
    const f = fakeSupabase((q: Recorded) => {
      if (q.table === table) return { data: null, error: { message: 'boom' } }
      if (q.table === 'habits') return { data: [habit('r1', 'reading')] }
      return { data: [] }
    })
    return loadTodayData(f.client, 'me', SANTIAGO, NOW)
  }

  test.each([
    'habits',
    'habit_items',
    'checkin_items',
    'checkins',
    'reading_entries',
    'workout_sessions',
    'workout_sets',
    'time_entries',
    'watch_entries',
    'cardio_entries',
    'quantity_entries',
    'books',
    'rpc:checkin_dates',
  ])('%s failing alone gives not-ok (a failed habits read is not an empty Hoy)', async (table) => {
    expect(await fail(table)).toEqual({ ok: false })
  })
})
