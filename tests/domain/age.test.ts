import { describe, expect, test } from 'vitest'
import { isAdult } from '@/domain/age'

describe('isAdult', () => {
  test('cumple 18 hoy', () => expect(isAdult('2008-11-23', '2026-11-23')).toBe(true))
  test('le falta un día', () => expect(isAdult('2008-11-24', '2026-11-23')).toBe(false))
  test('29 de febrero cumple el 1 de marzo', () => {
    expect(isAdult('2008-02-29', '2026-02-28')).toBe(false)
    expect(isAdult('2008-02-29', '2026-03-01')).toBe(true)
  })
  test('mayor de edad con holgura', () => expect(isAdult('1990-05-10', '2026-11-23')).toBe(true))
})
