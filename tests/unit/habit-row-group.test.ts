import { describe, expect, test } from 'vitest'
import { habitRowPropsEqual } from '@/components/habit-row-equal'
import type { HabitRowProps } from '@/components/HabitRow'
import { buildToday } from '@/domain/today'

const TODAY = '2026-11-25'
const view = buildToday({
  habits: [
    { id: 'a', name: 'Correr', icon: 'dumbbell', visibility: 'friends', requires_photo: false, frequency_type: 'daily', target_per_week: null },
  ],
  items: [],
  checkins: [],
  itemChecks: [],
  today: TODAY,
  timeZone: 'America/Santiago',
})
const base = (): HabitRowProps => ({ row: view.rows[0], today: TODAY, timeZone: 'America/Santiago', checkinId: null })

describe('habitRowPropsEqual: the group chip', () => {
  test('equal group values are equal, even as new objects', () => {
    expect(habitRowPropsEqual({ ...base(), group: { name: 'Corremos', color: 'teal' } }, { ...base(), group: { name: 'Corremos', color: 'teal' } })).toBe(true)
  })
  test('a chip that appears, disappears or changes re-renders the row', () => {
    const chip = { name: 'Corremos', color: 'teal' }
    expect(habitRowPropsEqual(base(), { ...base(), group: chip })).toBe(false)
    expect(habitRowPropsEqual({ ...base(), group: chip }, base())).toBe(false)
    expect(habitRowPropsEqual({ ...base(), group: chip }, { ...base(), group: { ...chip, name: 'Otro' } })).toBe(false)
    expect(habitRowPropsEqual({ ...base(), group: chip }, { ...base(), group: { ...chip, color: 'blue' } })).toBe(false)
  })
  test('no chip on either side stays equal', () => {
    expect(habitRowPropsEqual(base(), base())).toBe(true)
  })
})
