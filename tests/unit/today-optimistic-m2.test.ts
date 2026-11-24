import { describe, expect, it } from 'vitest'
import { buildToday } from '@/domain/today'
import {
  applyQuantityEntry,
  applyTime,
  removeQuantityEntry,
  removeTimeLog,
  setTimeLog,
  type OptimisticState,
} from '@/domain/today-optimistic'

const TODAY = '2026-03-10'
const water = {
  id: 'hq', name: 'Agua', icon: 'droplet', visibility: 'private', requires_photo: false, frequency_type: 'daily',
  target_per_week: null, log_type: 'quantity', quantity_unit: 'ml', quantity_label: null, quantity_target: 2000, quantity_step: 250,
  quantity_display: 'base', glass_ml: null,
}
const study = {
  id: 'ht', name: 'Estudio', icon: 'book', visibility: 'private', requires_photo: false, frequency_type: 'daily',
  target_per_week: null, log_type: 'time',
}
const base = (): OptimisticState => ({
  today: TODAY,
  habits: [water, study] as never,
  items: [],
  itemChecks: [],
  todayCheckins: [],
  checkins: [],
  todayLogs: { logs: {}, quantity: {} },
})
const view = (s: OptimisticState) =>
  buildToday({
    habits: s.habits, items: s.items, checkins: s.checkins, itemChecks: s.itemChecks, today: s.today, timeZone: 'UTC',
    logs: s.todayLogs?.logs, quantity: s.todayLogs?.quantity,
  })
const row = (s: OptimisticState, id: string) => view(s).rows.find((r) => r.id === id)!

describe('quantity reducers', () => {
  it('adds an entry to the running total without inventing the check-in (done follows the server)', () => {
    const s = applyQuantityEntry(applyQuantityEntry(base(), 'hq', 'e1', 250, '2026-03-10T10:00:00Z'), 'hq', 'e2', 2000, '2026-03-10T11:00:00Z')
    expect(row(s, 'hq').quantity!.total).toBe(2250)
    expect(row(s, 'hq').done).toBe(false)
  })
  it('is idempotent by entry id and never mutates its input', () => {
    const b = base()
    const once = applyQuantityEntry(b, 'hq', 'e1', 250, 'x')
    expect(applyQuantityEntry(once, 'hq', 'e1', 250, 'x').todayLogs!.quantity.hq).toHaveLength(1)
    expect(b.todayLogs!.quantity).toEqual({})
  })
  it('removes an entry by id, ignoring an unknown one', () => {
    const s = applyQuantityEntry(base(), 'hq', 'e1', 250, 'x')
    expect(row(removeQuantityEntry(s, 'e1'), 'hq').quantity!.total).toBe(0)
    expect(removeQuantityEntry(s, 'nope')).toBe(s)
  })
  it('works when the state has no todayLogs', () => {
    const { todayLogs: _omit, ...rest } = base()
    void _omit
    expect(applyQuantityEntry(rest as OptimisticState, 'hq', 'e1', 5, 'x').todayLogs!.quantity.hq).toHaveLength(1)
  })
})

describe('time reducers', () => {
  it('adds minutes to today and checks the habit in (as add_time does)', () => {
    const s = applyTime(applyTime(base(), 'ht', 20, null, 'c1'), 'ht', 25, 'inglés', 'c2')
    expect(s.todayLogs!.logs.ht).toEqual([{ kind: 'time', minutes: 45, topic: 'inglés' }])
    expect(row(s, 'ht').done).toBe(true)
    expect(s.todayCheckins).toHaveLength(1)
  })
  it('setTimeLog replaces the total and the topic (none clears it)', () => {
    const s = setTimeLog(applyTime(base(), 'ht', 20, 'a', 'c1'), 'ht', 50, null)
    expect(s.todayLogs!.logs.ht).toEqual([{ kind: 'time', minutes: 50, topic: null }])
  })
  it('removeTimeLog drops the minutes but leaves the check-in (as delete_time_entry does)', () => {
    const s = removeTimeLog(applyTime(base(), 'ht', 20, null, 'c1'), 'ht')
    expect(s.todayLogs!.logs.ht ?? []).toEqual([])
    expect(s.todayCheckins).toHaveLength(1)
  })
})
