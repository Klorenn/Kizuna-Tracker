import { describe, expect, it } from 'vitest'
import {
  formatAmount,
  monthlyQuantity,
  parseAmount,
  progressLabel,
  quantitySeries,
  stepAmount,
  validateQuantityConfig,
  type QuantityConfig,
} from '@/domain/quantity'

const water: QuantityConfig = { unit: 'ml', label: null, target: 2000, step: 250, display: 'glasses', glassMl: 250 }
const ml = { ...water, display: 'base' as const }
const q = [...Array(6)]
  .map(() => ({ date: '2026-11-01', amount: 250 }))
  .concat([
    { date: '2026-11-02', amount: 2000 },
    { date: '2026-11-03', amount: 2250 },
    { date: '2026-11-04', amount: 500 },
    { date: '2026-10-05', amount: 2000 },
    { date: '2026-10-06', amount: 2000 },
  ])
const done = ['2026-11-02', '2026-11-03', '2026-10-05', '2026-10-06']

describe('quantity formatting', () => {
  it('writes progress in glasses or base units', () => {
    expect(progressLabel(1250, water)).toBe('5 de 8 vasos')
    expect(progressLabel(1250, ml)).toBe('1.250 de 2.000 ml')
    expect(progressLabel(2000, water)).toBe('8 de 8 vasos')
  })
  it('formats amounts', () => {
    expect(formatAmount(250, water)).toBe('1 vaso')
    expect(formatAmount(1375, water)).toBe('5,5 vasos')
    expect(formatAmount(1562.5, water)).toBe('6,3 vasos')
    expect(formatAmount(8000, { ...water, unit: 'steps', display: 'base', target: 8000, step: 1000 })).toBe('8.000 pasos')
    expect(formatAmount(2.5, { ...water, unit: 'km', display: 'base', target: 5, step: 0.5 })).toBe('2,5 km')
    expect(formatAmount(1, { ...water, unit: 'times', display: 'base', target: 3, step: 1 })).toBe('1 vez')
    expect(formatAmount(3, { ...water, unit: 'custom', label: 'páginas', display: 'base', target: 10, step: 1 })).toBe('3 páginas')
  })
})

describe('quantity input', () => {
  it('returns the quick step and parses amounts to base units', () => {
    expect(stepAmount(water)).toBe(250)
    expect(parseAmount('1,5', water)).toBe(375)
    expect(parseAmount('330', ml)).toBe(330)
  })
  it('rejects empty, zero, negative, text and fractional ml', () => {
    for (const bad of ['', '0', '-1', 'abc', '12,5']) expect(parseAmount(bad, ml)).toBeNull()
  })
  it('validates the config', () => {
    expect(validateQuantityConfig(water)).toEqual({ ok: true })
    expect(validateQuantityConfig({ ...water, glassMl: 40 })).toEqual({ ok: false, error: 'El vaso va de 50 a 1.000 ml.' })
    expect(validateQuantityConfig({ ...water, target: 0 })).toEqual({ ok: false, error: 'La meta debe ser mayor que 0.' })
    expect(validateQuantityConfig({ ...water, step: 2500 })).toEqual({
      ok: false,
      error: 'La suma rápida no puede superar la meta.',
    })
    expect(validateQuantityConfig({ ...water, unit: 'custom', label: null, display: 'base' })).toEqual({
      ok: false,
      error: 'Escribe la unidad (hasta 12 caracteres).',
    })
  })
})

describe('quantity stats', () => {
  it('summarises a month', () => {
    expect(monthlyQuantity(q, done, '2026-11', water)).toEqual({
      month: '2026-11',
      total: 6250,
      days: 4,
      average: 1563,
      reached: 2,
      bestDay: { date: '2026-11-03', total: 2250 },
    })
    expect(monthlyQuantity([], [], '2026-11', water)).toEqual({
      month: '2026-11',
      total: 0,
      days: 0,
      average: 0,
      reached: 0,
      bestDay: null,
    })
  })
  it('builds a series', () => {
    expect(quantitySeries(q, done, ['2026-10', '2026-11'], water)).toEqual([
      { month: '2026-10', average: 2000, reached: 2 },
      { month: '2026-11', average: 1563, reached: 2 },
    ])
  })
})
