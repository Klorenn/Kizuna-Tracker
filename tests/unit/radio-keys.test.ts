import { describe, expect, it } from 'vitest'
import { radioKeyTarget } from '@/lib/radio-keys'

describe('radioKeyTarget (roving radiogroup)', () => {
  it('arrows move with wrap-around, Home/End jump', () => {
    expect(radioKeyTarget('ArrowRight', 0, 3)).toBe(1)
    expect(radioKeyTarget('ArrowDown', 2, 3)).toBe(0)
    expect(radioKeyTarget('ArrowLeft', 0, 3)).toBe(2)
    expect(radioKeyTarget('ArrowUp', 1, 3)).toBe(0)
    expect(radioKeyTarget('Home', 2, 3)).toBe(0)
    expect(radioKeyTarget('End', 0, 3)).toBe(2)
  })
  it('other keys do nothing', () => {
    expect(radioKeyTarget('Tab', 0, 3)).toBeNull()
    expect(radioKeyTarget('a', 0, 3)).toBeNull()
  })
})
