import { describe, expect, it } from 'vitest'
import { eligibleGroupHabits, groupChipsByHabit, linkedHabitIds } from '@/domain/group-habits'
import type { GroupSummary } from '@/lib/groups-contract'

const group = (over: Partial<GroupSummary>): GroupSummary => ({
  id: 'g1',
  name: 'Corremos',
  icon: 'target',
  color: 'blue',
  role: 'member',
  memberCount: 3,
  commitment: { name: 'Correr', icon: 'target', targetPerWeek: 3, requiresPhoto: false },
  myHabitId: 'h1',
  myDone: 0,
  myCounts: true,
  compliedCount: 0,
  countedCount: 3,
  streak: 0,
  archived: false,
  ...over,
})

describe('linkedHabitIds', () => {
  it('collects the habit of every live group', () => {
    const ids = linkedHabitIds([group({ myHabitId: 'a' }), group({ id: 'g2', myHabitId: 'b' })])
    expect([...ids].sort()).toEqual(['a', 'b'])
  })
  it('ignores archived groups and groups without a linked habit', () => {
    const ids = linkedHabitIds([group({ myHabitId: 'a', archived: true }), group({ id: 'g2', myHabitId: null })])
    expect(ids.size).toBe(0)
  })
})

describe('groupChipsByHabit', () => {
  it('maps a linked habit to its group name and colour', () => {
    expect(groupChipsByHabit([group({ myHabitId: 'a', name: 'Corremos', color: 'teal' })])).toEqual(
      new Map([['a', { name: 'Corremos', color: 'teal' }]]),
    )
  })
  it('skips archived groups and null habits', () => {
    expect(groupChipsByHabit([group({ archived: true }), group({ id: 'g2', myHabitId: null })]).size).toBe(0)
  })
  it('no groups, no chips', () => expect(groupChipsByHabit([]).size).toBe(0))
})

describe('eligibleGroupHabits', () => {
  const h = (over: Record<string, unknown> = {}) => ({
    id: 'h',
    name: 'Leer',
    visibility: 'friends',
    requires_photo: false,
    log_type: 'none',
    archived_at: null,
    ...over,
  })
  const none = new Set<string>()
  it('keeps a plain own habit, as { id, name }', () => {
    expect(eligibleGroupHabits([h({ id: 'a', name: 'Correr' })], none)).toEqual([{ id: 'a', name: 'Correr' }])
  })
  it('drops private, quantity, archived and linked habits', () => {
    const rows = [
      h({ id: 'private', visibility: 'private' }),
      h({ id: 'qty', log_type: 'quantity' }),
      h({ id: 'old', archived_at: '2026-01-01T00:00:00Z' }),
      h({ id: 'linked' }),
      h({ id: 'ok' }),
    ]
    expect(eligibleGroupHabits(rows, new Set(['linked'])).map((x) => x.id)).toEqual(['ok'])
  })
  it('keeps public and friends habits; other log types stay', () => {
    const rows = [h({ id: 'a', visibility: 'public' }), h({ id: 'b', log_type: 'reading' })]
    expect(eligibleGroupHabits(rows, none).map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('when the group asks for a photo, only habits with photo proof', () => {
    const rows = [h({ id: 'a', requires_photo: true }), h({ id: 'b' })]
    expect(eligibleGroupHabits(rows, none, { requiresPhoto: true }).map((x) => x.id)).toEqual(['a'])
    expect(eligibleGroupHabits(rows, none, { requiresPhoto: false }).map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('keeps the order it was given', () => {
    expect(eligibleGroupHabits([h({ id: 'z' }), h({ id: 'a' })], none).map((x) => x.id)).toEqual(['z', 'a'])
  })
})
