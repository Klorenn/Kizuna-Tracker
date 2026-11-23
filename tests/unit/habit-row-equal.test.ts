import { describe, expect, test } from 'vitest'
import { addLogOffered, habitRowPropsEqual } from '@/components/habit-row-equal'
import type { HabitRowProps } from '@/components/HabitRow'
import { buildToday } from '@/domain/today'

const TODAY = '2026-11-25'
const habits = ['a', 'b', 'c', 'd'].map((id) => ({
  id,
  name: `Hábito ${id}`,
  icon: 'dumbbell',
  visibility: 'friends',
  requires_photo: false,
  frequency_type: 'daily',
  target_per_week: null,
}))

/** What Hoy computes on every server render: brand-new (but equal) objects each time. */
function render(checked: string[]): HabitRowProps[] {
  const view = buildToday({
    habits,
    items: [],
    checkins: checked.map((habit_id) => ({ habit_id, local_date: TODAY })),
    itemChecks: [],
    today: TODAY,
    timeZone: 'America/Santiago',
  })
  return view.rows.map((row) => ({ row, today: TODAY, timeZone: 'America/Santiago', checkinId: null }))
}

describe('addLogOffered (never offer "Añadir registro" when the log state is unknown)', () => {
  const reading = { ...render(['a'])[0].row, done: true, log: null, logType: 'reading' as const }

  test('a done habit with a log type and no log, with logs known, offers it', () => {
    expect(addLogOffered(reading, true)).toBe(true)
  })
  test('with logs unknown it is never offered, so no sheet opens in add mode over an existing entry', () => {
    expect(addLogOffered(reading, false)).toBe(false)
  })
  test('quantity, none, not-done and already-logged habits never offer it', () => {
    expect(addLogOffered({ ...reading, logType: 'quantity' }, true)).toBe(false)
    expect(addLogOffered({ ...reading, logType: 'none' }, true)).toBe(false)
    expect(addLogOffered({ ...reading, done: false }, true)).toBe(false)
    expect(addLogOffered({ ...reading, log: { kind: 'reading', pages: 3, bookTitle: 'x' } }, true)).toBe(false)
  })
})

describe('habitRowPropsEqual (a tap on one row must not re-render the others)', () => {
  test('after one check-in, Hoy hands every row new objects: only the tapped row differs', () => {
    const before = render([])
    const after = render(['b'])
    const rerendered = before.map((prev, i) => !habitRowPropsEqual(prev, after[i]))
    expect(rerendered).toEqual([false, true, false, false])
  })

  test('a plain refresh with the same data re-renders no row', () => {
    const before = render(['a'])
    const after = render(['a'])
    expect(before.every((prev, i) => habitRowPropsEqual(prev, after[i]))).toBe(true)
  })

  test('a changed check-in id, day, zone or reading payload does re-render the row', () => {
    const [base] = render([])
    expect(habitRowPropsEqual(base, { ...base, checkinId: 'c1' })).toBe(false)
    expect(habitRowPropsEqual(base, { ...base, today: '2026-11-26' })).toBe(false)
    expect(habitRowPropsEqual(base, { ...base, timeZone: 'UTC' })).toBe(false)
    const reading = { books: [], checkinId: null, entry: null }
    expect(habitRowPropsEqual({ ...base, reading }, { ...base, reading: { ...reading, books: [] } })).toBe(true)
    expect(habitRowPropsEqual({ ...base, reading }, { ...base, reading: { ...reading, checkinId: 'x' } })).toBe(false)
  })
})
