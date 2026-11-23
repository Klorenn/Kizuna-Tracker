import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/app/(app)/registros/quantity-actions', () => ({
  addQuantity: vi.fn(),
  removeQuantity: vi.fn(),
  refreshQuantity: vi.fn(),
}))

import { QuantityControl } from '@/components/logs/QuantityControl'
import { QuantityPanel } from '@/components/logs/QuantitySheet'
import type { QuantityConfig } from '@/domain/quantity'
import { createQuantityQueue } from '@/lib/quantity-queue'
import { createQuickAddPress, LONG_PRESS_MS } from '@/lib/quick-add-press'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const glass: QuantityConfig = { unit: 'ml', label: null, target: 2000, step: 250, display: 'glasses', glassMl: 250 }

describe('quick-add press: a fast double tap is two sums', () => {
  it('two clicks 30 ms apart call add twice', () => {
    const add = vi.fn()
    const press = createQuickAddPress({ add, openSheet: vi.fn() })
    press.onClick()
    vi.advanceTimersByTime(30)
    press.onClick()
    expect(add).toHaveBeenCalledTimes(2)
  })

  it('two clicks 30 ms apart store two sums in the queue', async () => {
    const send = vi.fn(async () => new Promise<never>(() => {})) // never answers: both stay pending
    let n = 0
    const queue = createQuantityQueue(send as never, () => `e${++n}`, { storage: null })
    const press = createQuickAddPress({ add: () => queue.add('h1', 250), openSheet: vi.fn() })
    press.onClick()
    vi.advanceTimersByTime(30)
    press.onClick()
    expect(queue.pending().map((s) => s.entryId)).toEqual(['e1', 'e2'])
    expect(queue.optimisticTotal('h1')).toBe(500)
  })

  it('exposes no double-click handler that could swallow a tap', () => {
    const press = createQuickAddPress({ add: vi.fn(), openSheet: vi.fn() })
    expect(Object.keys(press).sort()).toEqual(['cancel', 'onClick', 'onPointerDown'])
  })
})

describe('quick-add press: the long press still opens the sheet', () => {
  it('opens after the hold and the click that follows adds nothing', () => {
    const add = vi.fn()
    const openSheet = vi.fn()
    const press = createQuickAddPress({ add, openSheet })
    press.onPointerDown()
    vi.advanceTimersByTime(LONG_PRESS_MS - 1)
    expect(openSheet).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(openSheet).toHaveBeenCalledTimes(1)
    press.onClick()
    expect(add).not.toHaveBeenCalled()
    // the next tap is a normal one again
    press.onClick()
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('releasing early cancels the hold and the tap adds', () => {
    const add = vi.fn()
    const openSheet = vi.fn()
    const press = createQuickAddPress({ add, openSheet })
    press.onPointerDown()
    vi.advanceTimersByTime(100)
    press.cancel()
    vi.advanceTimersByTime(1000)
    press.onClick()
    expect(openSheet).not.toHaveBeenCalled()
    expect(add).toHaveBeenCalledTimes(1)
  })
})

describe('touch-manipulation: no double-tap zoom on the quantity buttons', () => {
  it('the quick-add and the options buttons carry it', () => {
    const html = renderToStaticMarkup(
      createElement(QuantityControl, { habitId: 'h1', config: glass, total: 0, entries: [], timeZone: 'UTC' }),
    )
    const buttons = html.match(/<button[^>]*>/g) ?? []
    expect(buttons.length).toBeGreaterThanOrEqual(2)
    for (const b of buttons) expect(b, b).toContain('touch-manipulation')
  })

  it('every button of the sheet carries it', () => {
    const html = renderToStaticMarkup(
      createElement(QuantityPanel, {
        config: glass,
        total: 500,
        entries: [
          { id: 'a', amount: 250, at: '2026-11-22T12:00:00Z', saved: true },
          { id: 'b', amount: 250, at: '2026-11-22T12:05:00Z', saved: true },
        ],
        timeZone: 'UTC',
        onAdd: () => {},
        onRemove: () => {},
      }),
    )
    const buttons = html.match(/<button[^>]*>/g) ?? []
    expect(buttons.length).toBeGreaterThanOrEqual(4) // Sumar, two Quitar, Deshacer la última
    for (const b of buttons) expect(b, b).toContain('touch-manipulation')
  })
})
