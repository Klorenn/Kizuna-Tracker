import { describe, expect, it } from 'vitest'
import type { ItemView } from '@/lib/challenge-view'
import { buildCardItems, itemHabitIds } from '@/lib/retos-cards'

const view = (o: Partial<ItemView> = {}): ItemView => ({
  id: 'i1',
  position: 1,
  status: 'active',
  myHabitId: 'a',
  theirHabitId: 'b',
  target: 3,
  requiresPhoto: false,
  startsOn: '2026-11-02',
  pendingFor: null,
  ...o,
})
const habit = (name: string, over = {}) => ({
  id: name,
  name,
  icon: 'target',
  color: 'rosa',
  log_type: 'none',
  quantity_unit: null,
  quantity_label: null,
  quantity_target: null,
  quantity_step: null,
  quantity_display: 'base',
  glass_ml: 250,
  ...over,
})
const habits = new Map([
  ['a', habit('Gym')],
  ['b', habit('Pesas', { icon: 'no-such-icon', log_type: 'time' })],
  ['c', habit('Agua')],
])
const period = { start: '2026-11-09', end: '2026-11-15' }
const datesOf = (h: string) => (h === 'a' ? ['2026-11-09', '2026-11-10'] : h === 'b' ? ['2026-11-12'] : [])

describe('itemHabitIds', () => {
  it('collects both sides of every item, without nulls or duplicates', () => {
    expect(
      itemHabitIds([
        { creator_habit_id: 'x', rival_habit_id: null },
        { creator_habit_id: 'x', rival_habit_id: 'y' },
      ]),
    ).toEqual(['x', 'y'])
  })
})

describe('buildCardItems', () => {
  it('active item: names and progress of the running period', () => {
    const [i] = buildCardItems({ items: [view()], frequencyType: 'weekly', habitById: habits, period, datesOf })
    expect(i).toMatchObject({
      id: 'i1',
      myHabit: 'Gym',
      theirHabit: 'Pesas',
      progress: { type: 'weekly', target: 3, you: 2, them: 1 },
      create: null,
      pendingFor: null,
    })
  })

  it('no running period: no progress', () => {
    const [i] = buildCardItems({ items: [view()], frequencyType: 'weekly', habitById: habits, period: null, datesOf })
    expect(i.progress).toBeNull()
  })

  it('an item that has not started counts for nothing yet', () => {
    const [i] = buildCardItems({ items: [view({ startsOn: '2026-11-16' })], frequencyType: 'weekly', habitById: habits, period, datesOf })
    expect(i.progress).toBeNull()
    expect(i.startsOn).toBe('2026-11-16')
  })

  it('an item I must answer carries the "Crear" data of the proposer habit, with its own terms', () => {
    const [i] = buildCardItems({
      items: [view({ status: 'proposed', myHabitId: null, theirHabitId: 'b', pendingFor: 'me', requiresPhoto: true })],
      frequencyType: 'weekly',
      habitById: habits,
      period: null,
      datesOf,
    })
    expect(i.myHabit).toBe('')
    expect(i.theirHabit).toBe('Pesas')
    expect(i.create).toEqual({
      habitIcon: 'target',
      habitKind: 'Tiempo',
      createSubline: 'Hábito nuevo · 3 por semana · con foto',
      // a photo habit cannot log time: it falls back to "Solo marcar"
      createSimple: true,
      sourceReadable: true,
    })
  })

  it('a proposal I made waits on them: no "Crear" data', () => {
    const [i] = buildCardItems({
      items: [view({ status: 'proposed', myHabitId: 'c', theirHabitId: null, pendingFor: 'them' })],
      frequencyType: 'weekly',
      habitById: habits,
      period: null,
      datesOf,
    })
    expect(i).toMatchObject({ myHabit: 'Agua', theirHabit: '', create: null, pendingFor: 'them' })
  })

  it('a proposer habit that cannot be read: "Crear" is not offered', () => {
    const [i] = buildCardItems({
      items: [view({ status: 'proposed', myHabitId: null, theirHabitId: 'gone', pendingFor: 'me' })],
      frequencyType: 'daily',
      habitById: habits,
      period: null,
      datesOf,
    })
    expect(i.theirHabit).toBe('Hábito')
    expect(i.create).toMatchObject({ sourceReadable: false, createSimple: false })
  })
})
