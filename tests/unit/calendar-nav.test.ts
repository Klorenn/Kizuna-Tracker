import { describe, expect, it } from 'vitest'
import { navDir, swipeDirection, swipeStarted } from '@/lib/calendar-nav'
import { mergeSignedUrls } from '@/lib/signed-url-state'
import { onlyRejected, type HabitDay } from '@/lib/calendar-days'

describe('navDir', () => {
  it('a later month slides in as next, an earlier one as prev', () => {
    expect(navDir('2026-08', '2026-11')).toBe('next')
    expect(navDir('2026-11', '2026-10')).toBe('prev')
    expect(navDir('2025-12', '2026-01')).toBe('next')
  })
})

describe('swipe decision', () => {
  it('starts only when mostly horizontal and past 10 px', () => {
    expect(swipeStarted(8, 0)).toBe(false)
    expect(swipeStarted(20, 20)).toBe(false)
    expect(swipeStarted(-30, 10)).toBe(true)
  })
  it('left swipe goes to the next month, right to the previous', () => {
    expect(swipeDirection({ dx: -80, dy: 5, cancelled: false })).toBe('next')
    expect(swipeDirection({ dx: 80, dy: 5, cancelled: false })).toBe('prev')
  })
  it('short, vertical or cancelled gestures do nothing', () => {
    expect(swipeDirection({ dx: -40, dy: 0, cancelled: false })).toBeNull()
    expect(swipeDirection({ dx: -80, dy: 70, cancelled: false })).toBeNull()
    expect(swipeDirection({ dx: -80, dy: 0, cancelled: true })).toBeNull()
  })
})

describe('mergeSignedUrls', () => {
  it('keeps URLs already shown while new ones load (no flicker) and drops paths no longer listed', () => {
    const prev = { a: 'https://x/a', b: 'https://x/b', gone: 'https://x/gone' }
    expect(mergeSignedUrls(prev, ['a', 'b', 'c'], { a: 'https://x/a2' })).toEqual({
      a: 'https://x/a2',
      b: 'https://x/b',
    })
  })
  it('does not keep failures (they are retried)', () => {
    expect(mergeSignedUrls({ a: null }, ['a'], {})).toEqual({})
  })
})

const day = (status: HabitDay['status']): HabitDay => ({
  habitId: status,
  status,
  time: null,
  items: null,
  photos: [],
  rejectReason: status === 'rejected' ? 'other' : null,
})

describe('onlyRejected', () => {
  it('is true when the only record of the day is a rejected check-in', () => {
    expect(onlyRejected([day('rejected'), day('none')])).toBe(true)
    expect(onlyRejected([day('rejected'), day('done')])).toBe(false)
    expect(onlyRejected([day('rejected'), day('partial')])).toBe(false)
    expect(onlyRejected([day('none')])).toBe(false)
  })
})
