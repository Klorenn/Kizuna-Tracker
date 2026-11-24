import { describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { loadGoalsResult } from '@/lib/goals-data'
import { loadPerfilData } from '@/lib/perfil-data'
import { loadTodayData } from '@/lib/today-data'
import { loadWeightsAndLatest } from '@/lib/logs-data'
import { monthGuess, prefetchMonth } from '@/lib/month-prefetch'
import type { Recorded } from './support/fake-supabase'
import { gatedSupabase } from './support/gated-supabase'

const NOW = new Date('2026-11-25T15:00:00Z')
const GOAL = { id: 'g1', habit_id: 'h1', habits: { name: 'Correr', color: 'sage' }, kind: 'weekly', target: 4, starts_on: '2026-11-01', deadline: null, created_at: '2026-11-01T00:00:00Z' }

const respond = (q: Recorded) => {
  switch (q.table) {
    case 'habits':
      return { data: [{ id: 'h1', name: 'Correr', color: 'sage', frequency_type: 'daily', target_per_week: null, log_type: 'none' }] }
    case 'goals':
      return { data: [GOAL] }
    case 'rpc:checkin_dates':
      return { data: [{ habit_id: 'h1', dates: ['2026-11-25', '2026-11-24'] }] }
    case 'challenges':
      return { data: [{ id: 'c1', creator_id: 'me', rival_id: 'r', status: 'finished' }] }
    case 'debts':
      return { data: [] }
    case 'body_weights':
      return { data: [] }
    default:
      return { data: [] }
  }
}

describe('loadGoalsResult: the goals read does not wait for the date', () => {
  test('a pending date does not hold the goals select back; the history follows once it is known', async () => {
    const g = gatedSupabase(respond)
    let setToday!: (d: string) => void
    const today = new Promise<string>((r) => (setToday = r))
    const work = loadGoalsResult(g.client, 'me', today)
    await g.tick()
    expect(g.waiting.map((w) => w.q.table)).toEqual(['goals'])
    setToday('2026-11-25')
    const { value, levels } = await g.run(work)
    expect(levels).toEqual([['goals'], ['rpc:checkin_dates']])
    expect(value.ok).toBe(true)
    expect(value.goals[0]).toMatchObject({ current: 2, target: 4 })
  })
})

describe('loadPerfilData: two serial levels, not four', () => {
  const profile = Promise.resolve({ timezone: 'America/Santiago' })
  test('every independent read starts together; only the history and the debts of challenges follow', async () => {
    const g = gatedSupabase(respond)
    const { value: raw, levels } = await g.run(loadPerfilData(g.client, 'me', profile, NOW))
    if (raw.missingProfile) throw new Error('profile expected')
    const value = raw
    expect(levels).toHaveLength(2)
    expect([...levels[0]].sort()).toEqual(['body_weights', 'challenges', 'debts', 'goals', 'habits'].sort())
    expect([...levels[1]].sort()).toEqual(['debts', 'rpc:checkin_dates', 'rpc:checkin_dates'].sort())
    expect(value.today).toBe('2026-11-25')
    expect(value.record).toEqual({ won: 0, lost: 0 })
    expect(value.dated.ok && value.dated.byHabit.get('h1')).toEqual(['2026-11-25', '2026-11-24'])
    expect(value.goalsRead.goals).toHaveLength(1)
  })

  test('the history window is the same as before: dates older than today minus 400 days are dropped', async () => {
    // 2026-11-25 minus 400 days = 2025-10-21; the zone-free ask goes one day further back
    const g = gatedSupabase((q) =>
      q.table === 'rpc:checkin_dates'
        ? { data: [{ habit_id: 'h1', dates: ['2026-11-25', '2025-10-21', '2025-10-20', '2025-10-19'] }] }
        : respond(q),
    )
    const { value } = await g.run(loadPerfilData(g.client, 'me', profile, NOW))
    if (value.missingProfile) throw new Error('profile expected')
    expect(value.dated.ok && value.dated.byHabit.get('h1')).toEqual(['2026-11-25', '2025-10-21'])
  })

  test('no profile: reports it so the page redirects', async () => {
    const g = gatedSupabase(respond)
    const { value } = await g.run(loadPerfilData(g.client, 'me', Promise.resolve(null), NOW))
    expect(value.missingProfile).toBe(true)
  })
})

describe('loadTodayData (guard): never more than two serial levels', () => {
  test('profile, habits, items and chips together; then history, books and the day reads together', async () => {
    const g = gatedSupabase((q) => (q.table === 'habits' ? { data: [{ id: 'h1', log_type: 'reading' }] } : respond(q)))
    const { value, levels } = await g.run(loadTodayData(g.client, 'me', Promise.resolve({ timezone: 'America/Santiago' }), NOW))
    expect(value.ok).toBe(true)
    expect(levels.length).toBeLessThanOrEqual(2)
    expect(levels[0]).toEqual(expect.arrayContaining(['habits', 'habit_items']))
    // the profile here is already in hand, so the day reads join the first round; in a page they follow it in the second
    expect(levels[1]).toEqual(expect.arrayContaining(['rpc:checkin_dates', 'books']))
    expect(levels.flat()).toEqual(expect.arrayContaining(['checkins', 'checkin_items', 'reading_entries']))
  })
})

describe('loadWeightsAndLatest: the newest weigh-in is asked at the same time as the window', () => {
  test('one level; the latest is used only when the window is empty', async () => {
    const empty = gatedSupabase((q) => (q.table === 'body_weights' && q.calls.some((c) => c.method === 'range' && c.args[1] === 0) ? { data: [{ measured_on: '2026-01-02', weight_kg: '70.5' }] } : { data: [] }))
    const a = await empty.run(loadWeightsAndLatest(empty.client, 'me', '2026-10-01'))
    expect(a.levels).toHaveLength(1)
    expect(a.value).toEqual({ entries: [], latest: { date: '2026-01-02', kg: 70.5 } })

    const full = gatedSupabase((q) => ({ data: q.calls.some((c) => c.method === 'range' && c.args[1] === 0) ? [{ measured_on: '2026-01-02', weight_kg: 1 }] : [{ measured_on: '2026-11-02', weight_kg: '71' }] }))
    const b = await full.run(loadWeightsAndLatest(full.client, 'me', '2026-10-01'))
    expect(b.levels).toHaveLength(1)
    expect(b.value.latest).toBeNull()
    expect(b.value.entries).toEqual([{ date: '2026-11-02', kg: 71 }])
  })
})

describe('month prefetch: the calendar month starts before the first check-in is known', () => {
  test('monthGuess is the requested month when valid and not in the future, else the current one', () => {
    expect(monthGuess('2026-09', '2026-11')).toBe('2026-09')
    expect(monthGuess(['2026-09'], '2026-11')).toBe('2026-09')
    expect(monthGuess('2027-01', '2026-11')).toBe('2026-11')
    expect(monthGuess('nope', '2026-11')).toBe('2026-11')
    expect(monthGuess(undefined, '2026-11')).toBe('2026-11')
  })

  test('the guess is used when the final month matches; a different final month loads again', async () => {
    const load = vi.fn(async (m: string) => `days:${m}`)
    const p = prefetchMonth('2026-11', load)
    expect(load).toHaveBeenCalledTimes(1)
    expect(await p.forMonth('2026-11')).toBe('days:2026-11')
    expect(load).toHaveBeenCalledTimes(1)
    expect(await p.forMonth('2026-08')).toBe('days:2026-08')
    expect(load).toHaveBeenCalledTimes(2)
  })

  test('a failed guess that is discarded never becomes an unhandled rejection; a used one still throws', async () => {
    const load = vi.fn(async (m: string) => {
      if (m === '2026-11') throw new Error('boom')
      return m
    })
    const p = prefetchMonth('2026-11', load)
    expect(await p.forMonth('2026-08')).toBe('2026-08')
    const q = prefetchMonth('2026-11', load)
    await expect(q.forMonth('2026-11')).rejects.toThrow('boom')
  })
})
