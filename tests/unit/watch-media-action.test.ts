import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fakeSupabase, type Recorded } from './support/fake-supabase'

const state = { user: { id: 'u1', email: null } as { id: string; email: string | null } | null, fail: false }
const fake = { current: null as ReturnType<typeof fakeSupabase> | null }

vi.mock('@/lib/viewer', () => ({ getSessionUser: async () => state.user }))
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => fake.current!.client }))

import { loadWatchMedia } from '@/app/(app)/series/picker-actions'

const MEDIA = [
  { id: 'm1', title: 'Dark', kind: 'series', total_seasons: 3, total_episodes: 26, runtime_min: null, status: 'watching', created_at: '2026-11-01T00:00:00Z' },
  { id: 'm2', title: 'Viejo', kind: 'movie', total_seasons: null, total_episodes: null, runtime_min: 100, status: 'finished', created_at: '2026-10-01T00:00:00Z' },
]

beforeEach(() => {
  state.user = { id: 'u1', email: null }
  state.fail = false
  fake.current = fakeSupabase((q: Recorded) => {
    if (state.fail) return { data: null, error: { message: 'boom' } }
    if (q.table === 'media_items') return { data: MEDIA }
    return { data: [{ media_id: 'm1', local_date: '2026-11-20', season: 2, episode_to: 5 }] }
  })
})

describe('loadWatchMedia (the watch sheet loads its titles when it opens)', () => {
  test('returns the titles you are watching with where to continue each', async () => {
    const r = await loadWatchMedia()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.media.map((m) => m.id)).toEqual(['m1'])
    expect(r.media[0]).toMatchObject({ title: 'Dark', hintSeason: 2, hintEpisodeTo: 5 })
    // reads only the signed-in user's rows
    const eq = fake.current!.queries.flatMap((q) => q.calls.filter((c) => c.method === 'eq').map((c) => c.args))
    expect(eq).toEqual([['user_id', 'u1'], ['user_id', 'u1']])
  })

  test('without a session it answers an error and reads nothing', async () => {
    state.user = null
    expect(await loadWatchMedia()).toEqual({ ok: false, error: 'Inicia sesión para continuar.' })
    expect(fake.current!.queries).toEqual([])
  })

  test('a failed read is an error, never an empty list of titles', async () => {
    state.fail = true
    expect(await loadWatchMedia()).toEqual({ ok: false, error: 'No pudimos cargar tus títulos. Inténtalo de nuevo.' })
  })
})
