import { describe, expect, test } from 'vitest'
import {
  dayHeading,
  dayLabel,
  earliestMonth,
  monthBounds,
  monthGrid,
  monthNav,
  monthOf,
  monthTitle,
  parseMonthParam,
  WEEKDAY_LETTERS,
  recentMonths,
  shiftMonth,
  withSearch,
} from '@/domain/calendar'

describe('monthGrid', () => {
  test('semanas de lunes a domingo con días del mes anterior y siguiente', () => {
    // noviembre 2026 empieza en domingo y termina en lunes
    const weeks = monthGrid('2026-11')
    expect(weeks).toHaveLength(6)
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(weeks[0].map((d) => d.date)).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ])
    expect(weeks[0].map((d) => d.inMonth)).toEqual([false, false, false, false, false, false, true])
    expect(weeks[5][0]).toEqual({ date: '2026-11-30', inMonth: true })
    expect(weeks[5].at(-1)).toEqual({ date: '2026-12-06', inMonth: false })
  })
  test('un mes que empieza en lunes no tiene días previos', () => {
    const weeks = monthGrid('2026-06')
    expect(weeks[0][0]).toEqual({ date: '2026-06-01', inMonth: true })
    expect(weeks).toHaveLength(5)
    expect(weeks[4].map((d) => d.date)).toEqual([
      '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05',
    ])
  })
  test('febrero de 4 semanas exactas', () => {
    const weeks = monthGrid('2021-02')
    expect(weeks).toHaveLength(4)
    expect(weeks.flat().every((d) => d.inMonth)).toBe(true)
  })
  test('cruza el año', () => {
    const weeks = monthGrid('2027-01')
    // 1 de enero de 2027 es viernes
    expect(weeks[0][0]).toEqual({ date: '2026-12-28', inMonth: false })
    expect(weeks[0][4]).toEqual({ date: '2027-01-01', inMonth: true })
  })
})

describe('meses', () => {
  test('monthOf y shiftMonth', () => {
    expect(monthOf('2026-11-23')).toBe('2026-11')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-11', -13)).toBe('2025-10')
  })
  test('monthBounds incluye bisiestos', () => {
    expect(monthBounds('2026-02')).toEqual({ first: '2026-02-01', last: '2026-02-28' })
    expect(monthBounds('2028-02')).toEqual({ first: '2028-02-01', last: '2028-02-29' })
    expect(monthBounds('2026-12')).toEqual({ first: '2026-12-01', last: '2026-12-31' })
  })
})

describe('parseMonthParam', () => {
  const bounds = { current: '2026-11', earliest: '2026-03' }
  test('sin parámetro o inválido: mes actual', () => {
    expect(parseMonthParam(undefined, bounds)).toBe('2026-11')
    expect(parseMonthParam('', bounds)).toBe('2026-11')
    expect(parseMonthParam('basura', bounds)).toBe('2026-11')
    expect(parseMonthParam('2026-13', bounds)).toBe('2026-11')
    expect(parseMonthParam('2026-1', bounds)).toBe('2026-11')
    expect(parseMonthParam('2026-10-01', bounds)).toBe('2026-11')
  })
  test('mes válido dentro del rango', () => {
    expect(parseMonthParam('2026-10', bounds)).toBe('2026-10')
    expect(parseMonthParam('2026-03', bounds)).toBe('2026-03')
  })
  test('usa el primero si viene repetido', () => {
    expect(parseMonthParam(['2026-09', '2026-08'], bounds)).toBe('2026-09')
  })
  test('no pasa del mes actual ni antes del primero', () => {
    expect(parseMonthParam('2027-01', bounds)).toBe('2026-11')
    expect(parseMonthParam('2025-12', bounds)).toBe('2026-03')
  })
  test('si el primero es posterior al actual, manda el actual', () => {
    expect(parseMonthParam('2026-10', { current: '2026-11', earliest: '2027-02' })).toBe('2026-11')
  })
})

describe('earliestMonth', () => {
  test('el mes más antiguo entre los candidatos', () => {
    expect(earliestMonth(['2026-03-15', null, '2025-12-31', undefined], '2026-11')).toBe('2025-12')
  })
  test('sin candidatos o solo futuros: el mes actual', () => {
    expect(earliestMonth([], '2026-11')).toBe('2026-11')
    expect(earliestMonth([null, '2027-01-02'], '2026-11')).toBe('2026-11')
  })
})

describe('monthNav', () => {
  test('mes intermedio: ambos lados', () => {
    expect(monthNav('2026-09', { current: '2026-11', earliest: '2026-03' })).toEqual({
      prev: '2026-08',
      next: '2026-10',
      isCurrent: false,
    })
  })
  test('mes actual: sin siguiente', () => {
    expect(monthNav('2026-11', { current: '2026-11', earliest: '2026-03' })).toEqual({
      prev: '2026-10',
      next: null,
      isCurrent: true,
    })
  })
  test('primer mes: sin anterior', () => {
    expect(monthNav('2026-03', { current: '2026-11', earliest: '2026-03' }).prev).toBeNull()
    expect(monthNav('2026-11', { current: '2026-11', earliest: '2026-11' })).toEqual({
      prev: null,
      next: null,
      isCurrent: true,
    })
  })
})

describe('recentMonths', () => {
  test('del más nuevo al más antiguo, sin pasar del primero', () => {
    expect(recentMonths('2026-11', '2026-08', 12)).toEqual(['2026-11', '2026-10', '2026-09', '2026-08'])
  })
  test('como máximo n meses', () => {
    const r = recentMonths('2026-11', '2020-01', 12)
    expect(r).toHaveLength(12)
    expect(r.at(-1)).toBe('2025-12')
  })
})

describe('textos de fecha', () => {
  test('título del mes en sentence case', () => {
    expect(monthTitle('2026-11')).toEqual({ name: 'Noviembre', year: '2026' })
    expect(monthTitle('2027-01')).toEqual({ name: 'Enero', year: '2027' })
  })
  test('día corto', () => {
    expect(dayLabel('2026-11-23')).toBe('23 de noviembre')
    expect(dayLabel('2026-03-01')).toBe('1 de marzo')
  })
  test('las letras del calendario distinguen martes y miércoles', () => {
    expect(WEEKDAY_LETTERS).toEqual(['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'])
    expect(new Set(WEEKDAY_LETTERS).size).toBe(7)
  })
  test('encabezado del día con el día de la semana', () => {
    expect(dayHeading('2026-11-23', '2026-11-25')).toBe('Lunes 23 de noviembre')
    expect(dayHeading('2026-11-22', '2026-11-25')).toBe('Domingo 22 de noviembre')
  })
  test('agrega el año cuando no es el actual', () => {
    expect(dayHeading('2025-12-31', '2026-11-22')).toBe('Miércoles 31 de diciembre de 2025')
  })
})

describe('withSearch', () => {
  test('omite vacíos y respeta el orden', () => {
    expect(withSearch('/resumen', { h: 'todos', mes: '2026-10', vista: undefined })).toBe('/resumen?h=todos&mes=2026-10')
    expect(withSearch('/resumen', { h: undefined, mes: null })).toBe('/resumen')
  })
  test('codifica los valores', () => {
    expect(withSearch('/habitos/x', { mes: '2026-10', q: 'a b' })).toBe('/habitos/x?mes=2026-10&q=a+b')
  })
})
