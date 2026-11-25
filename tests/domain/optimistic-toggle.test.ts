import { describe, expect, test } from 'vitest'
import {
  TOGGLE_FAILED,
  applyItemChange,
  checkedCount,
  displayDone,
  nextSettled,
  planToggle,
  pruneSettledItems,
  settleToggle,
  settledDone,
  settledIsStale,
  settledItems,
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

describe('settled value (holds the confirmed flip until fresh props agree)', () => {
  test('with nothing settled, the props win', () => {
    expect(settledDone(true, null)).toBe(true)
  })
  test('props still show the pre-action state: the settled value is held (no flicker back to "done")', () => {
    expect(settledDone(true, { from: true, value: false })).toBe(false)
    expect(settledDone(false, { from: false, value: true })).toBe(true)
  })
  test('props moved on: they win, and the settled value is stale', () => {
    expect(settledDone(false, { from: true, value: false })).toBe(false)
    expect(settledDone(true, { from: false, value: true })).toBe(true)
    expect(settledIsStale(false, { from: true, value: false })).toBe(true)
    expect(settledIsStale(true, { from: true, value: false })).toBe(false)
    expect(settledIsStale(true, null)).toBe(false)
  })
  test('a failed action never settles anything', () => {
    expect(nextSettled(true, false, { ok: false, error: 'x' })).toBeNull()
    expect(nextSettled(true, false, { ok: true })).toEqual({ from: true, value: false })
  })
  test('steps: a held step stays flipped while props still show the old state', () => {
    const held = { a: { from: true, value: false } }
    const shown = settledItems([item('a', true), item('b', true)], held)
    expect(shown.map((i) => i.checked)).toEqual([false, true])
    // props caught up: untouched
    const fresh = [item('a', false), item('b', true)]
    expect(settledItems(fresh, held)).toBe(fresh)
    expect(settledItems(fresh, {})).toBe(fresh)
  })
  test('steps: entries the props already agree with are dropped', () => {
    const held = { a: { from: true, value: false }, b: { from: true, value: false } }
    expect(pruneSettledItems([item('a', false), item('b', true)], held)).toEqual({ b: { from: true, value: false } })
    const same = { b: { from: true, value: false } }
    expect(pruneSettledItems([item('b', true)], same)).toBe(same)
  })
})
