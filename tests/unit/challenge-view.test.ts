import { describe, expect, it } from 'vitest'
import { challengeFrequency, countDone, frequencyLabel, periodStatus } from '@/lib/challenge-view'

const weekly = { frequency_type: 'weekly', target_per_week: 4, weeks: 8, starts_on: '2026-11-02' }
const daily = { frequency_type: 'daily', target_per_week: null, weeks: 2, starts_on: '2026-11-02' }

describe('challenge view helpers', () => {
  it('builds the frequency and its label', () => {
    expect(challengeFrequency(weekly)).toEqual({ type: 'weekly', target: 4 })
    expect(challengeFrequency(daily)).toEqual({ type: 'daily' })
    expect(frequencyLabel({ type: 'weekly', target: 4 })).toBe('4 por semana')
    expect(frequencyLabel({ type: 'daily' })).toBe('Diario')
  })

  it('locates the current period', () => {
    expect(periodStatus(weekly, '2026-11-18')).toMatchObject({
      state: 'running',
      index: 3,
      total: 8,
      period: { start: '2026-11-16', end: '2026-11-22' },
    })
    expect(periodStatus(daily, '2026-11-05')).toMatchObject({ state: 'running', index: 4, total: 14 })
  })

  it('knows before the start and after the end', () => {
    expect(periodStatus(weekly, '2026-11-01')).toMatchObject({ state: 'pending', total: 8 })
    expect(periodStatus(weekly, '2027-02-01')).toMatchObject({ state: 'over', total: 8 })
    expect(periodStatus({ ...weekly, starts_on: null }, '2026-11-18').state).toBe('pending')
  })

  it('counts distinct dates inside a period', () => {
    const p = { start: '2026-11-16', end: '2026-11-22' }
    expect(countDone(p, ['2026-11-15', '2026-11-16', '2026-11-16', '2026-11-22', '2026-11-23'])).toBe(2)
  })
})

import { dayMonthLabel, endsOn, firstName, weekdayLabel } from '@/lib/challenge-view'

describe('labels', () => {
  it('formats dates in Spanish without timezone drift', () => {
    expect(weekdayLabel('2026-11-29')).toBe('dom 29')
    expect(weekdayLabel('2026-11-23')).toBe('lun 23')
    expect(dayMonthLabel('2026-11-02')).toBe('2 nov')
  })

  it('finds the last day and the first name', () => {
    expect(endsOn(weekly)).toBe('2026-12-27')
    expect(endsOn({ ...weekly, starts_on: null })).toBeNull()
    expect(firstName('Caro Pérez')).toBe('Caro')
    expect(firstName(null)).toBe('Tu amigo')
  })
})
