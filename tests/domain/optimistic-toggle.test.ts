import { describe, expect, test } from 'vitest'
import {
  TOGGLE_FAILED,
  applyItemChange,
  checkedCount,
  displayDone,
  planToggle,
  settleToggle,
} from '@/domain/optimistic-toggle'
import type { TodayItem } from '@/domain/today'

const item = (id: string, checked: boolean): TodayItem => ({ id, label: id, position: 0, requiresPhoto: false, checked, time: checked ? '08:00' : null }) as TodayItem

describe('planToggle (apply)', () => {
  test('a tap on an undone habit checks it, optimistically done', () => {
    expect(planToggle(false, false)).toEqual({ run: true, action: 'do', optimistic: true })
  })
  test('a tap on a done habit undoes it, optimistically not done', () => {
    expect(planToggle(true, false)).toEqual({ run: true, action: 'undo', optimistic: false })
  })
  test('a tap while the previous one is still in flight is ignored (no double check-in, no spurious "nothing to undo")', () => {
    expect(planToggle(false, true)).toEqual({ run: false })
    expect(planToggle(true, true)).toEqual({ run: false })
  })
})

describe('settleToggle (confirm and rollback)', () => {
  test('confirm: an ok result leaves no error', async () => {
    expect(await settleToggle(async () => ({ ok: true }))).toEqual({ ok: true })
  })
  test('rollback: a refused action surfaces its own message', async () => {
    expect(await settleToggle(async () => ({ ok: false, error: 'No puedes deshacer este registro.' }))).toEqual({
      ok: false,
      error: 'No puedes deshacer este registro.',
    })
  })
  test('rollback: a thrown action (network drop) is a visible error, not an unhandled throw into the error boundary', async () => {
    expect(
      await settleToggle(async () => {
        throw new Error('fetch failed')
      }),
    ).toEqual({ ok: false, error: TOGGLE_FAILED })
  })
})

describe('displayDone', () => {
  test('shows the optimistic value while one is pending, the confirmed one otherwise', () => {
    expect(displayDone(false, true)).toBe(true)
    expect(displayDone(true, false)).toBe(false)
    expect(displayDone(true, null)).toBe(true)
    expect(displayDone(false, null)).toBe(false)
  })
})

describe('item checks', () => {
  const items = [item('a', true), item('b', false)]
  test('applyItemChange flips one item and leaves the rest, without mutating', () => {
    const next = applyItemChange(items, { id: 'b', checked: true })
    expect(next.map((i) => i.checked)).toEqual([true, true])
    expect(next[1].time).toBe('…')
    expect(items[1].checked).toBe(false)
    expect(applyItemChange(next, { id: 'a', checked: false })[0]).toMatchObject({ checked: false, time: null })
  })
  test('checkedCount counts the checked ones', () => {
    expect(checkedCount(items)).toBe(1)
    expect(checkedCount(applyItemChange(items, { id: 'b', checked: true }))).toBe(2)
  })
})
