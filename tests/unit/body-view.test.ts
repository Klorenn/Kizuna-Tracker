import { describe, expect, it } from 'vitest'
import {
  RANGES,
  entryDateLabel,
  monthRowLabel,
  parseRange,
  rangeFrom,
  weightAlt,
} from '@/components/profile/body-view'

describe('parseRange', () => {
  it('defaults to 6 months and only accepts known chips', () => {
    expect(parseRange(undefined)).toBe('6m')
    expect(parseRange('x')).toBe('6m')
    expect(parseRange(['3m'])).toBe('6m')
    expect(parseRange('3m')).toBe('3m')
    expect(parseRange('1a')).toBe('1a')
    expect(parseRange('todo')).toBe('todo')
  })

  it('has the four chips in order', () => {
    expect(RANGES.map((r) => r.label)).toEqual(['3 m', '6 m', '1 año', 'Todo'])
  })
})

describe('rangeFrom', () => {
  it('counts back from today; Todo has no lower bound', () => {
    expect(rangeFrom('3m', '2026-11-22')).toBe('2026-08-22')
    expect(rangeFrom('6m', '2026-11-22')).toBe('2026-05-22')
    expect(rangeFrom('1a', '2026-11-22')).toBe('2025-11-22')
    expect(rangeFrom('todo', '2026-11-22')).toBeNull()
  })

  it('clamps the end of month like the calendar', () => {
    expect(rangeFrom('3m', '2026-05-31')).toBe('2026-02-28')
  })
})

describe('entryDateLabel', () => {
  it('writes the day and short month, with the year when it is not this year', () => {
    expect(entryDateLabel('2026-11-20', '2026-11-22')).toBe('20 nov')
    expect(entryDateLabel('2026-03-02', '2026-11-22')).toBe('2 mar')
    expect(entryDateLabel('2025-12-31', '2026-11-22')).toBe('31 dic 2025')
  })
})

describe('monthRowLabel', () => {
  it('is the capitalised month and its year', () => {
    expect(monthRowLabel('2026-11')).toBe('Noviembre 2026')
  })
})

describe('weightAlt', () => {
  it('says it is empty without data', () => {
    expect(weightAlt([], '2026-11-22')).toBe('Evolución del peso: sin registros en este periodo.')
  })

  it('describes a single point', () => {
    expect(weightAlt([{ date: '2026-11-20', kg: 71.9 }], '2026-11-22')).toBe(
      'Evolución del peso: 1 registro, 71,9 kg el 20 nov.',
    )
  })

  it('describes start, end, minimum and maximum', () => {
    const series = [
      { date: '2026-10-28', kg: 72.4 },
      { date: '2026-11-05', kg: 71.9 },
      { date: '2026-11-20', kg: 71.2 },
    ]
    expect(weightAlt(series, '2026-11-22')).toBe(
      'Evolución del peso: 3 registros. De 72,4 kg el 28 oct a 71,2 kg el 20 nov. Mínimo 71,2 kg, máximo 72,4 kg.',
    )
  })
})
