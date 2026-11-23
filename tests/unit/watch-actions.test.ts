import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, localDate } from '@/domain/dates'

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] }
const calls: Call[] = []
const rpc = vi.fn()
// results by "table.op"
let results: Record<string, unknown> = {}
let user: { id: string } | null = { id: 'u1' }

function chain(call: Call, result: () => unknown) {
  const c: Record<string, unknown> = {}
  for (const m of ['eq', 'is', 'in', 'limit', 'select', 'order']) {
    c[m] = (col: string, v: unknown) => {
      if (m === 'eq') call.filters.push([col, v])
      return c
    }
  }
  c.single = async () => result()
  c.maybeSingle = async () => result()
  c.then = (res: (v: unknown) => unknown) => res(result())
  return c
}

function builder(table: string) {
  const op = (name: string, payload?: unknown) => {
    const call: Call = { table, op: name, payload, filters: [] }
    calls.push(call)
    return chain(call, () => results[`${table}.${name}`] ?? { data: null, error: null })
  }
  return {
    insert: (p: unknown) => op('insert', p),
    update: (p: unknown) => op('update', p),
    delete: () => op('delete'),
    select: () => op('select'),
  }
}

const client = {
  auth: { getUser: async () => ({ data: { user } }) },
  rpc,
  from: (t: string) => builder(t),
}

vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => client }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  checkInWithWatch,
  createMedia,
  deleteMedia,
  deleteWatch,
  saveWatch,
  setMediaFinished,
  updateMedia,
} from '@/app/(app)/registros/watch-actions'

import { mediaDeleteCopy, pickerMedia } from '@/app/(app)/series/media-data'

beforeEach(() => {
  calls.length = 0
  rpc.mockReset()
  results = {}
  user = { id: 'u1' }
})

const series = {
  mediaId: 'dark',
  episodes: 3,
  season: 1,
  episodeTo: 3,
  minutes: null,
  completed: false,
  finished: false,
}
const rpcArgs = {
  p_checkin_id: 'c1',
  p_media_id: 'dark',
  p_episodes: 3,
  p_season: 1,
  p_episode_to: 3,
  p_minutes: null,
  p_completed: false,
  p_finished: false,
}

function checkinThen(second: unknown) {
  rpc.mockImplementation(async (fn: string) =>
    fn === 'create_checkin' ? { data: [{ checkin_id: 'c1', created: true }], error: null } : second,
  )
}

describe('checkInWithWatch', () => {
  it('checks in, then saves the watch entry on that check-in', async () => {
    checkinThen({ data: 'w1', error: null })
    await expect(checkInWithWatch('h1', series)).resolves.toEqual({ ok: true, checkinId: 'c1', created: true })
    expect(rpc.mock.calls).toEqual([
      ['create_checkin', { p_habit_id: 'h1' }],
      ['save_watch_entry', rpcArgs],
    ])
  })

  it('"Omitir" (no entry) only checks in', async () => {
    rpc.mockResolvedValue({ data: [{ checkin_id: 'c1', created: true }], error: null })
    await expect(checkInWithWatch('h1', null)).resolves.toEqual({ ok: true, checkinId: 'c1', created: true })
    expect(rpc.mock.calls).toEqual([['create_checkin', { p_habit_id: 'h1' }]])
  })

  it('a failed entry keeps the check-in and says so (invalid_watch copy)', async () => {
    checkinThen({ data: null, error: { message: 'invalid_watch', code: 'P0001' } })
    await expect(checkInWithWatch('h1', series)).resolves.toEqual({
      ok: false,
      checkedIn: true,
      error: 'Revisa lo que viste: episodios, temporada o minutos.',
    })
  })

  it('an unknown entry failure keeps the check-in with the spec copy', async () => {
    checkinThen({ data: null, error: { message: 'boom' } })
    await expect(checkInWithWatch('h1', series)).resolves.toEqual({
      ok: false,
      checkedIn: true,
      error: 'Marcamos el hábito, pero no guardamos lo que viste. Inténtalo de nuevo.',
    })
  })

  it('a movie with neither minutes nor "completa" is refused before any rpc', async () => {
    const movie = { ...series, mediaId: 'dune', episodes: null, season: null, episodeTo: null }
    await expect(checkInWithWatch('h1', movie)).resolves.toEqual({
      ok: false,
      checkedIn: false,
      error: 'Indica los minutos o marca que la viste completa.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('a failed check-in reports checkedIn false', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_authenticated' } })
    await expect(checkInWithWatch('h1', series)).resolves.toEqual({
      ok: false,
      checkedIn: false,
      error: 'Inicia sesión para continuar.',
    })
  })
})

describe('saveWatch / deleteWatch', () => {
  it('saves on an existing check-in and maps every watch error', async () => {
    rpc.mockResolvedValue({ data: 'w1', error: null })
    await expect(saveWatch('c1', series)).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('save_watch_entry', rpcArgs)
    const cases: [string, string][] = [
      ['invalid_watch', 'Revisa lo que viste: episodios, temporada o minutos.'],
      ['media_not_found', 'No encontramos ese título.'],
      ['log_type_mismatch', 'Este hábito no lleva ese tipo de registro.'],
      ['checkin_not_found', 'Ese día no tiene check-in.'],
      ['habit_not_found', 'No encontramos ese hábito.'],
      ['not_authenticated', 'Inicia sesión para continuar.'],
    ]
    for (const [code, error] of cases) {
      rpc.mockResolvedValue({ data: null, error: { message: code } })
      await expect(saveWatch('c1', series)).resolves.toEqual({ ok: false, error })
    }
  })

  it('deleteWatch calls delete_watch_entry', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await expect(deleteWatch('c1')).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('delete_watch_entry', { p_checkin_id: 'c1' })
  })
})

describe('media titles', () => {
  it('createMedia validates, trims and inserts for the user', async () => {
    results['media_items.insert'] = { data: { id: 'm1' }, error: null }
    await expect(
      createMedia({ title: ' Dune ', kind: 'movie', totalSeasons: null, totalEpisodes: null, runtimeMin: 155 }),
    ).resolves.toEqual({ ok: true, id: 'm1' })
    expect(calls[0]).toMatchObject({
      table: 'media_items',
      op: 'insert',
      payload: { user_id: 'u1', title: 'Dune', kind: 'movie', total_seasons: null, total_episodes: null, runtime_min: 155 },
    })
    await expect(
      createMedia({ title: ' ', kind: 'series', totalSeasons: null, totalEpisodes: null, runtimeMin: null }),
    ).resolves.toEqual({ ok: false, error: 'Escribe el título.' })
  })

  it('createMedia without a session', async () => {
    user = null
    await expect(
      createMedia({ title: 'Dark', kind: 'series', totalSeasons: 3, totalEpisodes: 26, runtimeMin: null }),
    ).resolves.toEqual({ ok: false, error: 'Inicia sesión para continuar.' })
  })

  it('updateMedia keeps the kind and updates the other fields', async () => {
    results['media_items.select'] = { data: { kind: 'series' }, error: null }
    await expect(
      updateMedia('m1', { title: 'Dark', totalSeasons: 3, totalEpisodes: 26, runtimeMin: null }),
    ).resolves.toEqual({ ok: true })
    const update = calls.find((c) => c.op === 'update')
    expect(update).toMatchObject({
      table: 'media_items',
      payload: { title: 'Dark', total_seasons: 3, total_episodes: 26, runtime_min: null },
      filters: [['id', 'm1']],
    })
    expect(update?.payload).not.toHaveProperty('kind')
  })

  it('updateMedia validates against the stored kind', async () => {
    results['media_items.select'] = { data: { kind: 'movie' }, error: null }
    await expect(
      updateMedia('m1', { title: 'Dune', totalSeasons: 2, totalEpisodes: null, runtimeMin: null }),
    ).resolves.toEqual({ ok: false, error: 'Una película no lleva temporadas ni episodios.' })
    expect(calls.some((c) => c.op === 'update')).toBe(false)
    results['media_items.select'] = { data: null, error: null }
    await expect(
      updateMedia('m9', { title: 'X', totalSeasons: null, totalEpisodes: null, runtimeMin: null }),
    ).resolves.toEqual({ ok: false, error: 'No encontramos ese título.' })
  })

  it('setMediaFinished refuses a date after today in the profile timezone', async () => {
    results['profiles.select'] = { data: { timezone: 'Pacific/Kiritimati' }, error: null }
    const tomorrow = addDays(localDate(new Date(), 'Pacific/Kiritimati'), 1)
    await expect(setMediaFinished('m1', tomorrow)).resolves.toEqual({ ok: false, error: 'La fecha no puede ser futura.' })
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('setMediaFinished marks finished on a date, or back to watching with null', async () => {
    results['profiles.select'] = { data: { timezone: 'America/Santiago' }, error: null }
    await expect(setMediaFinished('m1', '2026-11-02')).resolves.toEqual({ ok: true })
    expect(calls.find((c) => c.table === 'profiles')?.filters).toEqual([['id', 'u1']])
    expect(calls.find((c) => c.op === 'update')).toMatchObject({
      table: 'media_items',
      payload: { status: 'finished', finished_on: '2026-11-02' },
      filters: [['id', 'm1']],
    })
    calls.length = 0
    await expect(setMediaFinished('m1', null)).resolves.toEqual({ ok: true })
    expect(calls.find((c) => c.op === 'update')).toMatchObject({ payload: { status: 'watching', finished_on: null } })
  })

  it('setMediaFinished maps the database guard and rejects malformed dates', async () => {
    results['profiles.select'] = { data: { timezone: 'America/Santiago' }, error: null }
    results['media_items.update'] = { data: null, error: { message: 'invalid_finished_on', code: '23514' } }
    await expect(setMediaFinished('m1', '2026-11-02')).resolves.toEqual({
      ok: false,
      error: 'La fecha no puede ser futura.',
    })
    await expect(setMediaFinished('m1', '2026-13-40')).resolves.toEqual({ ok: false, error: 'Elige una fecha válida.' })
  })

  it('mediaDeleteCopy counts records, episodes and time with the right singular', () => {
    expect(mediaDeleteCopy(1, 3, 0)).toBe('Se borrará 1 registro (3 episodios). Tus check-ins no cambian.')
    expect(mediaDeleteCopy(4, 5, 190)).toBe('Se borrarán 4 registros (5 episodios, 3 h 10 min). Tus check-ins no cambian.')
    expect(mediaDeleteCopy(1, 0, 155)).toBe('Se borrará 1 registro (2 h 35 min). Tus check-ins no cambian.')
    expect(mediaDeleteCopy(0, 0, 0)).toBe('El título no tiene registros. Tus check-ins no cambian.')
  })

  it('pickerMedia lists watching titles, last used first, with the continue hint', () => {
    const row = (id: string, status: string, created_at: string) => ({
      id, title: id, kind: 'series', total_seasons: null, total_episodes: null, runtime_min: null, status, created_at,
    })
    const list = pickerMedia(
      [row('a', 'watching', '2026-01-01'), row('b', 'watching', '2026-02-01'), row('c', 'finished', '2026-03-01')],
      [{ media_id: 'a', local_date: '2026-11-02', season: 1, episode_to: 6 }],
    )
    expect(list.map((m) => m.id)).toEqual(['a', 'b'])
    expect(list[0]).toMatchObject({ hintSeason: 1, hintEpisodeTo: 6 })
    expect(pickerMedia([row('c', 'finished', '2026-03-01')], [], 'c').map((m) => m.id)).toEqual(['c'])
  })

  it('deleteMedia deletes that title', async () => {
    await expect(deleteMedia('m1')).resolves.toEqual({ ok: true })
    expect(calls[0]).toMatchObject({ table: 'media_items', op: 'delete', filters: [['id', 'm1']] })
    results['media_items.delete'] = { error: { message: 'boom' } }
    await expect(deleteMedia('m1')).resolves.toEqual({
      ok: false,
      error: 'No pudimos guardar los cambios. Inténtalo de nuevo.',
    })
  })
})
