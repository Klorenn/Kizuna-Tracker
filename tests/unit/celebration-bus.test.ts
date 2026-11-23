import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { announceReading, celebrationsHeld, clearReading, holdCelebrations, onCelebrationsReleased, takeReading } from '@/lib/celebration-bus'

describe('celebration bus', () => {
  it('hands the saved reading to the next taker once', () => {
    announceReading({ pages: 26, finishedTitle: null })
    expect(takeReading()).toEqual({ pages: 26, finishedTitle: null })
    expect(takeReading()).toBeNull()
  })
  it('the latest announcement wins', () => {
    announceReading({ pages: 10, finishedTitle: null })
    announceReading({ pages: 26, finishedTitle: 'Dune' })
    expect(takeReading()).toEqual({ pages: 26, finishedTitle: 'Dune' })
  })
  it('clearReading drops an announcement (failed save)', () => {
    announceReading({ pages: 3, finishedTitle: null })
    clearReading()
    expect(takeReading()).toBeNull()
  })
  it('holds celebrations while a reading sheet is open and notifies on the last release', () => {
    const released = vi.fn()
    const off = onCelebrationsReleased(released)
    const a = holdCelebrations()
    const b = holdCelebrations()
    expect(celebrationsHeld()).toBe(true)
    a()
    a() // idempotent
    expect(celebrationsHeld()).toBe(true)
    expect(released).not.toHaveBeenCalled()
    b()
    expect(celebrationsHeld()).toBe(false)
    expect(released).toHaveBeenCalledTimes(1)
    off()
  })
})
