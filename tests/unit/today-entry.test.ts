import { describe, expect, test } from 'vitest'
import { countLogged } from '@/lib/today-entry'
import { fakeSupabase } from './support/fake-supabase'

const run = (logType: string, res: { count?: number | null; error?: { message: string } }) =>
  countLogged(fakeSupabase(() => ({ data: null, ...res })).client as never, logType as never, 'c1')

describe('countLogged (does today\'s check-in already have its log?)', () => {
  test.each([
    ['reading', 'reading_entries'],
    ['workout', 'workout_sessions'],
    ['time', 'time_entries'],
    ['watch', 'watch_entries'],
    ['cardio', 'cardio_entries'],
  ])('%s counts rows of %s', async (logType, table) => {
    const f = fakeSupabase(() => ({ data: null, count: 2 } as never))
    expect(await countLogged(f.client as never, logType as never, 'c1')).toEqual({ ok: true, logged: true })
    expect(f.queries.map((q) => q.table)).toEqual([table])
  })

  test('no rows is a real "not logged"', async () => {
    expect(await run('reading', { count: 0 })).toEqual({ ok: true, logged: false })
  })

  test('a failed count is not-ok: neither "Añadir" nor "Editar" may be shown', async () => {
    expect(await run('reading', { error: { message: 'boom' } })).toEqual({ ok: false })
  })

  test('log types without a per-check-in entry are not logged', async () => {
    expect(await run('none', { count: 5 })).toEqual({ ok: true, logged: false })
  })
})
