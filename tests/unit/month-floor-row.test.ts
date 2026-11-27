import { describe, expect, test } from 'vitest'
import { monthFloorRowModel } from '@/components/map/MonthFloorRow'

describe('monthFloorRowModel', () => {
  test('una lectura fallida es error, no un cero', () => {
    expect(monthFloorRowModel({ ok: false })).toEqual({ kind: 'error' })
  })

  test('cero y cuatro usan el piso de 1', () => {
    expect(monthFloorRowModel({ ok: true, completed: 0 })).toEqual({
      kind: 'link',
      label: 'Este mes',
      value: '0 de 1',
      href: '/mapa',
    })
    expect(monthFloorRowModel({ ok: true, completed: 4 })).toEqual({
      kind: 'link',
      label: 'Este mes',
      value: '4 de 1',
      href: '/mapa',
    })
  })
})
