import { describe, expect, test } from 'vitest'
import { monthTicks, signedLabel } from '@/components/charts/ComparisonBars'

const months = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => `2026-${String(((from + i - 1) % 12) + 1).padStart(2, '0')}`)

describe('signedLabel', () => {
  test('los positivos llevan "+", cero y negativos no', () => {
    const f = (n: number) => String(n).replace('-', '−')
    expect(signedLabel(40, f)).toBe('+40')
    expect(signedLabel(0, f)).toBe('0')
    expect(signedLabel(-5, f)).toBe('−5')
  })
})

describe('monthTicks', () => {
  test('hasta 6 meses: todos con su nombre corto', () => {
    expect(monthTicks(months(6, 6))).toEqual(['Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov'])
  })

  test('12 meses: un mes de por medio, con tres letras (nada de letras sueltas) y el último siempre', () => {
    const t = monthTicks(months(12, 12))
    expect(t).toHaveLength(12)
    expect(t[11]).toBe('Nov')
    expect(t.filter(Boolean)).toHaveLength(6)
    expect(t.filter(Boolean).every((x) => x.length === 3)).toBe(true)
    expect(t[10]).toBe('')
  })
})
