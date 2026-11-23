import { describe, expect, it } from 'vitest'
import {
  formatCm,
  formatKg1,
  formatSignedKg1,
  latestWeight,
  monthlyWeightChange,
  monthlyWeightSummary,
  parseKg,
  parseWeightKg,
  weightSeries,
  type WeightEntry,
} from '@/domain/body'

const entries: WeightEntry[] = [
  { date: '2026-11-20', kg: 71.2 },
  { date: '2026-10-28', kg: 72.4 },
  { date: '2026-11-05', kg: 71.9 },
]

describe('body weight', () => {
  it('finds the latest entry', () => {
    expect(latestWeight(entries)).toEqual({ date: '2026-11-20', kg: 71.2 })
    expect(latestWeight([])).toBeNull()
  })

  it('returns an ascending series with inclusive bounds', () => {
    expect(weightSeries(entries, '2026-10-28', '2026-11-05')).toEqual([
      { date: '2026-10-28', kg: 72.4 },
      { date: '2026-11-05', kg: 71.9 },
    ])
    expect(weightSeries(entries, '2026-12-01', '2026-12-31')).toEqual([])
  })

  it('computes the monthly change against the last entry before the month', () => {
    expect(monthlyWeightChange(entries, '2026-11')).toBe(-1.2)
  })

  it('falls back to the first entry of the month, or null with fewer than 2 points', () => {
    const noEarlier = entries.filter((e) => e.date >= '2026-11-01')
    expect(monthlyWeightChange(noEarlier, '2026-11')).toBe(-0.7)
    expect(monthlyWeightChange([{ date: '2026-11-05', kg: 71.9 }], '2026-11')).toBeNull()
    expect(monthlyWeightChange(entries, '2026-12')).toBeNull()
  })

  it('summarises months', () => {
    expect(monthlyWeightSummary(entries, ['2026-09', '2026-10', '2026-11'])).toEqual([
      { month: '2026-09', last: null, change: null },
      { month: '2026-10', last: 72.4, change: null },
      { month: '2026-11', last: 71.2, change: -1.2 },
    ])
  })

  it('formats and parses', () => {
    expect(formatKg1(72.4)).toBe('72,4 kg')
    expect(formatKg1(72)).toBe('72,0 kg')
    expect(formatSignedKg1(-1.2)).toBe('−1,2 kg')
    expect(formatSignedKg1(1.2)).toBe('+1,2 kg')
    expect(formatCm(172)).toBe('172 cm')
    expect(formatCm(172.5)).toBe('172,5 cm')
    expect(parseKg('72,4')).toBe(72.4)
    expect(parseKg('72.4')).toBe(72.4)
    expect(parseKg('abc')).toBeNull()
    expect(parseWeightKg('72,4')).toBe(72.4)
    expect(parseWeightKg('19,9')).toBeNull()
    expect(parseWeightKg('400,1')).toBeNull()
  })
})
