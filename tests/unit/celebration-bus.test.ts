import { describe, expect, it } from 'vitest'
import { announceReading, takeReading } from '@/lib/celebration-bus'

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
})
