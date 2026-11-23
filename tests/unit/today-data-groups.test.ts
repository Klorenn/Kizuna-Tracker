import { describe, expect, test } from 'vitest'
import { loadTodayData } from '@/lib/today-data'
import { fakeSupabase, type Recorded } from './support/fake-supabase'

const NOW = new Date('2026-11-25T15:00:00Z')
const SANTIAGO = Promise.resolve({ timezone: 'America/Santiago' })
const habit = (id: string) => ({ id, name: id, log_type: 'none' })
const mine = (over: Record<string, unknown>) => ({
  id: 'g1',
  name: 'Corremos',
  icon: 'target',
  color: 'teal',
  role: 'member',
  member_count: 3,
  commitment_name: 'Correr',
  commitment_icon: 'target',
  target_per_week: 3,
  requires_photo: false,
  my_habit_id: 'h1',
  my_done: 0,
  my_counts: true,
  complied_count: 0,
  counted_count: 3,
  streak: 0,
  archived: false,
  ...over,
})

function load(groups: (q: Recorded) => { data: unknown; error?: { message: string } | null }) {
  const f = fakeSupabase((q: Recorded) => {
    if (q.table === 'habits') return { data: [habit('h1'), habit('h2')] }
    if (q.table === 'rpc:my_groups') return groups(q)
    return { data: [] }
  })
  return loadTodayData(f.client, 'me', SANTIAGO, NOW).then((data) => ({ data, queries: f.queries }))
}

describe('loadTodayData: group chips', () => {
  test('exactly one extra call, my_groups, and the linked habit gets its group', async () => {
    const { data, queries } = await load(() => ({ data: [mine({})] }))
    expect(queries.filter((q) => q.table === 'rpc:my_groups')).toHaveLength(1)
    expect(data.ok && data.groupChips).toEqual(new Map([['h1', { name: 'Corremos', color: 'teal' }]]))
  })

  test('the call starts with the other reads, before the profile arrives', async () => {
    let release!: (p: { timezone: string }) => void
    const profile = new Promise<{ timezone: string }>((r) => (release = r))
    const f = fakeSupabase((q: Recorded) => (q.table === 'habits' ? { data: [habit('h1')] } : { data: [] }))
    const pending = loadTodayData(f.client, 'me', profile, NOW)
    await new Promise((r) => setTimeout(r, 5))
    expect(f.queries.map((q) => q.table)).toContain('rpc:my_groups')
    release({ timezone: 'America/Santiago' })
    await pending
  })

  test('a failed read is decoration: Hoy still loads, without chips', async () => {
    const { data } = await load(() => ({ data: null, error: { message: 'boom' } }))
    expect(data.ok).toBe(true)
    expect(data.ok && data.groupChips.size).toBe(0)
  })

  test('a function that does not exist yet (migration not applied) is the same', async () => {
    const { data } = await load(() => ({ data: null, error: { message: 'Could not find the function public.my_groups' } }))
    expect(data.ok && data.groupChips.size).toBe(0)
  })

  test('a throwing call is the same', async () => {
    const { data } = await load(() => {
      throw new Error('network')
    })
    expect(data.ok).toBe(true)
    expect(data.ok && data.groupChips.size).toBe(0)
  })

  test('a malformed answer gives no chips, never a broken Hoy', async () => {
    const { data } = await load(() => ({ data: { not: 'a list' } }))
    expect(data.ok && data.groupChips.size).toBe(0)
  })

  test('archived groups give no chip', async () => {
    const { data } = await load(() => ({ data: [mine({ archived: true })] }))
    expect(data.ok && data.groupChips.size).toBe(0)
  })

  test('a failed Hoy read is still not-ok even when the groups read works', async () => {
    const f = fakeSupabase((q: Recorded) => {
      if (q.table === 'habit_items') return { data: null, error: { message: 'boom' } }
      if (q.table === 'habits') return { data: [habit('h1')] }
      if (q.table === 'rpc:my_groups') return { data: [mine({})] }
      return { data: [] }
    })
    expect(await loadTodayData(f.client, 'me', SANTIAGO, NOW)).toEqual({ ok: false })
  })
})
