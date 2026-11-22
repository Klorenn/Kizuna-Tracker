import { describe, expect, test } from 'vitest'
import { localDate, weekStart, addDays } from '@/domain/dates'

describe('dates', () => {
  test('localDate usa la zona del usuario', () => {
    expect(localDate(new Date('2026-11-23T02:30:00Z'), 'America/Santiago')).toBe('2026-11-22')
  })
  test('weekStart devuelve lunes', () => {
    expect(weekStart('2026-11-22')).toBe('2026-11-16')
  })
  test('addDays suma y resta', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
  })
})
