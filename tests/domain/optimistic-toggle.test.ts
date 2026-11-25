import { describe, expect, test } from 'vitest'
import {
  TOGGLE_FAILED,
  applyItemChange,
  checkedCount,
  displayDone,
  nextSettled,
  IDLE_QUEUE,
  followUpFor,
  nextIntent,
  settleQueue,
  tapQueue,
  pruneSettledItems,
  settleToggle,
  settledDone,
  settledIsStale,
  settledItems,
} from '@/domain/optimistic-toggle'
import type { TodayItem } from '@/domain/today'

const item = (id: string, checked: boolean): TodayItem => ({ id, label: id, position: 0, requiresPhoto: false, checked, time: checked ? '08:00' : null }) as TodayItem

describe('nextIntent', () => {
  test('idle: a tap wants the opposite of the confirmed state', () => {
    expect(nextIntent(false, IDLE_QUEUE)).toBe(true)
    expect(nextIntent(true, IDLE_QUEUE)).toBe(false)
  })
  test('in flight: a tap flips what the user last asked for, not the stale confirmed state', () => {
    expect(nextIntent(false, { target: true, intent: true })).toBe(false)
    expect(nextIntent(false, { target: true, intent: false })).toBe(true)
  })
})

describe('followUpFor', () => {
  test('nothing queued, or already there: no request', () => {
    expect(followUpFor(true, null)).toBeNull()
    expect(followUpFor(true, true)).toBeNull()
  })
  test('the confirmed state differs from the intent: exactly the action that reaches it', () => {
    expect(followUpFor(true, false)).toBe('undo')
    expect(followUpFor(false, true)).toBe('do')
  })
})

describe('tapQueue / settleQueue (coalescing)', () => {
  test('first tap on an idle row runs the action at once, shown optimistically', () => {
    expect(tapQueue(IDLE_QUEUE, false)).toEqual({ queue: { target: true, intent: true }, run: 'do', shown: true })
    expect(tapQueue(IDLE_QUEUE, true)).toEqual({ queue: { target: false, intent: false }, run: 'undo', shown: false })
  })
  test('a tap in flight is queued as the latest intent, never dropped, no request yet', () => {
    const first = tapQueue(IDLE_QUEUE, false)
    expect(tapQueue(first.queue, false)).toEqual({ queue: { target: true, intent: false }, run: null, shown: false })
  })
  test('check, uncheck: after the check settles one undo reaches the intent', () => {
    const t1 = tapQueue(IDLE_QUEUE, false)
    const t2 = tapQueue(t1.queue, false)
    expect(settleQueue(t2.queue, true)).toEqual({ queue: { target: false, intent: false }, run: 'undo', shown: false })
  })
  test('check, uncheck, check: coalesces, the settle needs no extra request', () => {
    let q = tapQueue(IDLE_QUEUE, false).queue
    q = tapQueue(q, false).queue
    const t3 = tapQueue(q, false)
    expect(t3.shown).toBe(true)
    expect(t3.run).toBeNull()
    expect(settleQueue(t3.queue, true)).toEqual({ queue: IDLE_QUEUE, run: null, shown: true })
  })
  test('uncheck, check, uncheck while in flight: one follow-up at most', () => {
    let q = tapQueue(IDLE_QUEUE, true).queue // undo in flight
    q = tapQueue(q, true).queue
    q = tapQueue(q, true).queue
    expect(q.intent).toBe(false)
    expect(settleQueue(q, true).run).toBeNull()
  })
  test('a settled follow-up with nothing newer goes idle', () => {
    const s = settleQueue({ target: false, intent: false }, true)
    expect(s.queue).toEqual(IDLE_QUEUE)
    expect(s.run).toBeNull()
  })
  test('failure drops the queued intent and sends nothing', () => {
    const t2 = tapQueue(tapQueue(IDLE_QUEUE, false).queue, false)
    expect(settleQueue(t2.queue, false)).toEqual({ queue: IDLE_QUEUE, run: null, shown: null })
  })
  test('a failed follow-up also drops everything', () => {
    expect(settleQueue({ target: false, intent: false }, false).queue).toEqual(IDLE_QUEUE)
  })
  test('per item: queues are independent values', () => {
    const a = tapQueue(IDLE_QUEUE, false)
    const b = tapQueue(IDLE_QUEUE, true)
    expect(a.run).toBe('do')
    expect(b.run).toBe('undo')
    expect(tapQueue(a.queue, false).queue).not.toEqual(b.queue)
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
