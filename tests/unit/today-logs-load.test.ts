import { describe, expect, test } from 'vitest'
import { loadTodayLogs } from '@/lib/today-logs'
import { fakeSupabase } from './support/fake-supabase'

const TABLES = ['reading_entries', 'workout_sessions', 'workout_sets', 'time_entries', 'watch_entries', 'cardio_entries', 'quantity_entries']

const run = (failing?: string) =>
  loadTodayLogs(fakeSupabase((q) => (q.table === failing ? { data: null, error: { message: 'boom' } } : { data: [] })).client as never, 'me', '2026-11-25')

describe('loadTodayLogs', () => {
  test('every read worked: ok with the logs', async () => {
    const r = await run()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.logs).toEqual({})
  })

  test.each(TABLES)('%s failing alone gives not-ok, never an empty list', async (table) => {
    expect(await run(table)).toEqual({ ok: false })
  })
})
