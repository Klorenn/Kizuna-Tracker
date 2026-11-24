import { describe, expect, test } from 'vitest'
import { loadTodayCore } from '@/lib/today-core'
import { loadTodayData } from '@/lib/today-data'
import { fakeSupabase, type Recorded } from './support/fake-supabase'

const NOW = new Date('2026-11-25T15:00:00Z')
const SANTIAGO = Promise.resolve({ timezone: 'America/Santiago' })
const habit = (id: string) => ({ id, name: id, log_type: 'none' })
const mk = () =>
  fakeSupabase((q: Recorded) => {
    if (q.table === 'habits') return { data: [habit('h1'), habit('h2')] }
    if (q.table === 'rpc:checkin_dates') return { data: [{ habit_id: 'h1', dates: ['2026-11-25', '2026-11-24'] }] }
    if (q.table === 'rpc:my_groups') return { data: [] }
    return { data: [] }
  })

describe('loadTodayCore', () => {
  test('uses the injected loadChips for groupChips, called once and before the profile arrives', async () => {
    let release!: (p: { timezone: string }) => void
    const profile = new Promise<{ timezone: string }>((r) => (release = r))
    let calls = 0
    const chips = new Map([['h1', { name: 'Corremos', color: 'teal' }]])
    const f = mk()
    const pending = loadTodayCore(f.client, 'me', profile, NOW, async () => (calls++, chips))
    await new Promise((r) => setTimeout(r, 5))
    expect(calls).toBe(1)
    release({ timezone: 'America/Santiago' })
    const data = await pending
    expect(data.ok && data.groupChips).toEqual(chips)
    expect(data.ok && data.today).toBe('2026-11-25')
    expect(data.ok && data.checkins).toEqual([
      { habit_id: 'h1', local_date: '2026-11-25' },
      { habit_id: 'h1', local_date: '2026-11-24' },
    ])
  })

  test('a loadChips that rejects is "no chips", never a failed Hoy', async () => {
    const data = await loadTodayCore(mk().client, 'me', SANTIAGO, NOW, async () => { throw new Error('boom') })
    expect(data.ok).toBe(true)
    expect(data.ok && data.groupChips).toEqual(new Map())
    expect(data.ok && data.habits.map((h) => h.id)).toEqual(['h1', 'h2'])
  })

  test('a missing profile is reported as missingProfile', async () => {
    expect(await loadTodayCore(mk().client, 'me', Promise.resolve(null), NOW, async () => new Map())).toEqual({ ok: false, missingProfile: true })
  })
})

describe('loadTodayData wrapper equivalence', () => {
  test('returns exactly what loadTodayCore returns for the same reads, chips from my_groups', async () => {
    const group = { id: 'g1', name: 'Corremos', icon: 'target', color: 'teal', role: 'member', member_count: 3, commitment_name: 'Correr', commitment_icon: 'target', target_per_week: 3, requires_photo: false, my_habit_id: 'h1', my_done: 0, my_counts: true, complied_count: 0, counted_count: 3, streak: 0, archived: false }
    const respond = (q: Recorded) => {
      if (q.table === 'habits') return { data: [habit('h1'), habit('h2')] }
      if (q.table === 'rpc:checkin_dates') return { data: [{ habit_id: 'h1', dates: ['2026-11-25'] }] }
      if (q.table === 'rpc:my_groups') return { data: [group] }
      return { data: [] }
    }
    const wrapped = await loadTodayData(fakeSupabase(respond).client, 'me', SANTIAGO, NOW)
    const chips = new Map([['h1', { name: 'Corremos', color: 'teal' }]])
    const core = await loadTodayCore(fakeSupabase(respond).client, 'me', SANTIAGO, NOW, async () => chips)
    expect(wrapped).toEqual(core)
    expect(wrapped.ok && wrapped.groupChips).toEqual(chips)
  })
})
