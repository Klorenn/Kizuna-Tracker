import { describe, expect, it } from 'vitest'
import { loadHabitCandidates } from '@/lib/group-habits-data'
import { args, fakeSupabase, type Recorded } from './support/fake-supabase'

const row = { id: 'h1', name: 'Correr', visibility: 'friends', requires_photo: false, log_type: 'none', archived_at: null }

describe('loadHabitCandidates', () => {
  it('reads the caller own, live, not private habits in one call', async () => {
    const f = fakeSupabase(() => ({ data: [row] }))
    expect(await loadHabitCandidates('me', f.client)).toEqual({ ok: true, data: [row] })
    expect(f.queries).toHaveLength(1)
    const q = f.queries[0] as Recorded
    expect(q.table).toBe('habits')
    expect(args(q, 'eq')).toContainEqual(['user_id', 'me'])
    expect(args(q, 'is')).toContainEqual(['archived_at', null])
    expect(args(q, 'neq')).toContainEqual(['visibility', 'private'])
    expect(args(q, 'select')[0][0]).toBe('id,name,visibility,requires_photo,log_type,archived_at')
  })
  it('a failed read is an error, never an empty list', async () => {
    const f = fakeSupabase(() => ({ data: null, error: { message: 'boom' } }))
    const r = await loadHabitCandidates('me', f.client)
    expect(r.ok).toBe(false)
  })
  it('a throw is an error too', async () => {
    const f = fakeSupabase(() => {
      throw new Error('network')
    })
    expect((await loadHabitCandidates('me', f.client)).ok).toBe(false)
  })
  it('no rows is an empty list, ok', async () => {
    const f = fakeSupabase(() => ({ data: [] }))
    expect(await loadHabitCandidates('me', f.client)).toEqual({ ok: true, data: [] })
  })
})
