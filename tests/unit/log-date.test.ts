import { describe, expect, it } from 'vitest'
import { isLocalDate, logDateParam } from '@/lib/log-date'

describe('isLocalDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isLocalDate('2026-11-22')).toBe(true)
    expect(isLocalDate('2028-02-29')).toBe(true)
    expect(isLocalDate('2026-02-29')).toBe(false)
    expect(isLocalDate('2026-13-01')).toBe(false)
    expect(isLocalDate('2026-1-01')).toBe(false)
    expect(isLocalDate('')).toBe(false)
  })
})

describe('logDateParam (?fecha=)', () => {
  const today = '2026-11-22'
  it('keeps a valid past or present date', () => {
    expect(logDateParam('2026-11-20', today)).toBe('2026-11-20')
    expect(logDateParam('2026-11-22', today)).toBe('2026-11-22')
  })
  it('falls back to today when missing, malformed, repeated or future', () => {
    expect(logDateParam(undefined, today)).toBe(today)
    expect(logDateParam('ayer', today)).toBe(today)
    expect(logDateParam(['2026-11-20', '2026-11-21'], today)).toBe(today)
    expect(logDateParam('2026-11-23', today)).toBe(today)
  })
})
