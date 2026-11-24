import { describe, expect, it } from 'vitest'
import { buildToday } from '@/domain/today'
import {
  applyCheckin,
  applyItem,
  removeCheckin,
  removeItem,
  type OptimisticState,
} from '@/domain/today-optimistic'

const habit = (id: string) => ({
  id, name: id, icon: 'check', visibility: 'private', requires_photo: false,
  frequency_type: 'daily', target_per_week: null,
})
const TODAY = '2026-03-10'
const base = (): OptimisticState => ({
  today: TODAY,
  habits: [habit('h1'), habit('h2')],
  items: [
    { id: 'i1', habit_id: 'h2', label: 'a', position: 0, requires_photo: false },
    { id: 'i2', habit_id: 'h2', label: 'b', position: 1, requires_photo: false },
  ],
  itemChecks: [],
  todayCheckins: [],
  checkins: [{ habit_id: 'h1', local_date: '2026-03-09' }],
})
const view = (s: OptimisticState) =>
  buildToday({ habits: s.habits, items: s.items, checkins: s.checkins, itemChecks: s.itemChecks, today: s.today, timeZone: 'UTC' })

describe('today-optimistic', () => {
  it('applyCheckin marks done, bumps the streak and does not mutate the input', () => {
    const s = base()
    const next = applyCheckin(s, 'h1', 'tmp-1')
    expect(s.todayCheckins).toEqual([])
    expect(next.todayCheckins).toEqual([{ id: 'tmp-1', habit_id: 'h1' }])
    const row = view(next).rows.find((r) => r.id === 'h1')!
    expect(row.done).toBe(true)
    expect(row.streak).toBe(2)
  })
  it('applyCheckin equals the server state math', () => {
    const server = base()
    server.checkins = [...server.checkins, { habit_id: 'h1', local_date: TODAY }]
    expect(view(applyCheckin(base(), 'h1', 'x'))).toEqual(view(server))
  })
  it('applyCheckin is idempotent for a habit already done today', () => {
    const once = applyCheckin(base(), 'h1', 'a')
    const twice = applyCheckin(once, 'h1', 'b')
    expect(twice.todayCheckins).toHaveLength(1)
    expect(twice.checkins.filter((c) => c.habit_id === 'h1' && c.local_date === TODAY)).toHaveLength(1)
  })
  it('removeCheckin undoes it', () => {
    const undone = removeCheckin(applyCheckin(base(), 'h1', 'a'), 'h1')
    expect(view(undone)).toEqual(view(base()))
    expect(undone.todayCheckins).toEqual([])
  })
  it('applyItem checks a step; the day completes only with the last one', () => {
    const first = applyItem(base(), 'i1', '2026-03-10T12:00:00Z')
    expect(view(first).rows.find((r) => r.id === 'h2')).toMatchObject({ done: false })
    expect(view(first).rows.find((r) => r.id === 'h2')!.items[0].checked).toBe(true)
    const second = applyItem(first, 'i2', '2026-03-10T12:01:00Z', 'tmp-day')
    expect(view(second).rows.find((r) => r.id === 'h2')).toMatchObject({ done: true })
    expect(second.todayCheckins).toEqual([{ id: 'tmp-day', habit_id: 'h2' }])
  })
  it('applyItem ignores an unknown item and a repeated check', () => {
    const s = base()
    expect(applyItem(s, 'nope', 'x')).toEqual(s)
    const once = applyItem(s, 'i1', '2026-03-10T12:00:00Z')
    expect(applyItem(once, 'i1', '2026-03-10T12:05:00Z').itemChecks).toHaveLength(1)
  })
  it('removeItem unchecks and drops the day check-in (server uncheck_item does the same)', () => {
    let s = applyItem(applyItem(base(), 'i1', '2026-03-10T12:00:00Z'), 'i2', '2026-03-10T12:01:00Z', 'tmp-day')
    s = removeItem(s, 'i2')
    const row = view(s).rows.find((r) => r.id === 'h2')!
    expect(row.done).toBe(false)
    expect(row.items.map((i) => i.checked)).toEqual([true, false])
    expect(s.todayCheckins).toEqual([])
  })
  it('only counts item checks of today', () => {
    const s = base()
    s.itemChecks = [{ item_id: 'i1', local_date: '2026-03-09', created_at: '2026-03-09T10:00:00Z' }]
    const next = applyItem(s, 'i2', '2026-03-10T12:00:00Z')
    expect(view(next).rows.find((r) => r.id === 'h2')!.done).toBe(false)
  })
})
