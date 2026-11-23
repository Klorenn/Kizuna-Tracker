import { describe, expect, test } from 'vitest'
import { VALUE_BASE, valueSizeClass } from '@/lib/value-size'

describe('valueSizeClass', () => {
  test('baja un escalón a medida que el valor es más largo', () => {
    expect(valueSizeClass('26')).toBe('text-[28px]')
    expect(valueSizeClass('+40 kg')).toBe('text-[28px]')
    expect(valueSizeClass('100,5 kg')).toBe('text-[24px]')
    expect(valueSizeClass('+1.250 kg')).toBe('text-[20px]')
    expect(valueSizeClass('12.350 kg')).toBe('text-[20px]')
    expect(valueSizeClass('−12.350,5 kg')).toBe('text-[17px]')
  })

  test('el valor nunca se trunca', () => {
    expect(VALUE_BASE).not.toMatch(/truncate|ellipsis|overflow-hidden/)
  })
})
