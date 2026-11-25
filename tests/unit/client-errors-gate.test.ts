import { describe, expect, it } from 'vitest'
import { createGate } from '@/lib/client-errors/gate'

describe('createGate', () => {
  it('lets a key through once', () => {
    const g = createGate(10)
    expect(g('a')).toBe(true)
    expect(g('a')).toBe(false)
    expect(g('b')).toBe(true)
  })
  it('caps the page load at max accepted errors', () => {
    const g = createGate(3)
    expect([1, 2, 3, 4, 5].map((n) => g(`k${n}`))).toEqual([true, true, true, false, false])
  })
  it('a duplicate does not consume the cap', () => {
    const g = createGate(2)
    g('a'); g('a'); g('a')
    expect(g('b')).toBe(true)
    expect(g('c')).toBe(false)
  })
})
