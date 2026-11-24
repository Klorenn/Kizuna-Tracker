import { describe, expect, test } from 'vitest'
import {
  challengeStartDate, periodsFor, evaluatePeriod, isPeriodClosable, canReject,
  evaluateItems, itemAppliesTo, nextItemStart, type ChallengeItemSpec,
} from '@/domain/challenges'

describe('challenges', () => {
  test('reto semanal aceptado un miércoles empieza el lunes siguiente', () => {
    expect(challengeStartDate(new Date('2026-11-18T15:00:00Z'), 'America/Santiago', { type: 'weekly', target: 4 })).toBe('2026-11-23')
  })
  test('reto diario empieza al día siguiente', () => {
    expect(challengeStartDate(new Date('2026-11-18T15:00:00Z'), 'America/Santiago', { type: 'daily' })).toBe('2026-11-19')
  })
  test('4 semanas semanales = 4 períodos', () => {
    const p = periodsFor('2026-11-23', 4, { type: 'weekly', target: 4 })
    expect(p).toHaveLength(4)
    expect(p[0]).toEqual({ start: '2026-11-23', end: '2026-11-29' })
  })
  test('2 semanas diarias = 14 períodos de un día', () => {
    expect(periodsFor('2026-11-19', 2, { type: 'daily' })).toHaveLength(14)
  })
  test('semanal: 3 de 4 falla, 4 de 4 cumple', () => {
    const period = { start: '2026-11-23', end: '2026-11-29' }
    const r = evaluatePeriod(period, { type: 'weekly', target: 4 },
      ['2026-11-23','2026-11-24','2026-11-25'], ['2026-11-23','2026-11-24','2026-11-25','2026-11-26'])
    expect(r).toEqual({ creatorFailed: true, rivalFailed: false })
  })
  test('check-ins fuera del período no cuentan', () => {
    const r = evaluatePeriod({ start: '2026-11-23', end: '2026-11-23' }, { type: 'daily' }, ['2026-11-22'], ['2026-11-23'])
    expect(r.creatorFailed).toBe(true)
  })
  test('no se cierra antes de que termine el período en la zona del reto', () => {
    expect(isPeriodClosable({ start: '2026-11-23', end: '2026-11-29' }, 'America/Santiago', new Date('2026-11-30T01:00:00Z'), [])).toBe(false)
  })
  test('no se cierra con una foto dentro de su ventana de 24 h', () => {
    const now = new Date('2026-11-30T12:00:00Z')
    expect(isPeriodClosable({ start: '2026-11-23', end: '2026-11-29' }, 'America/Santiago', now, [new Date('2026-11-30T02:00:00Z')])).toBe(false)
  })
  test('se cierra cuando terminó y no hay fotos en ventana', () => {
    expect(isPeriodClosable({ start: '2026-11-23', end: '2026-11-29' }, 'America/Santiago', new Date('2026-12-01T12:00:00Z'), [new Date('2026-11-29T20:00:00Z')])).toBe(true)
  })
  test('canReject: 23 h sí, 25 h no', () => {
    const t = new Date('2026-11-23T10:00:00Z')
    expect(canReject(t, new Date('2026-11-24T09:00:00Z'))).toBe(true)
    expect(canReject(t, new Date('2026-11-24T11:00:00Z'))).toBe(false)
  })
})

const W1 = { start: '2026-11-23', end: '2026-11-29' }
const item = (id: string, over: Partial<ChallengeItemSpec> = {}): ChallengeItemSpec => ({
  id, creatorHabitId: `c-${id}`, rivalHabitId: `r-${id}`, frequency: { type: 'weekly', target: 3 }, requiresPhoto: false, startsOn: '2026-11-23', ...over,
})
const dates = (n: number, from = 23) => Array.from({ length: n }, (_, i) => `2026-11-${from + i}`)

describe('evaluateItems', () => {
  test('con un solo ítem da lo mismo que evaluatePeriod', () => {
    const f = { type: 'weekly', target: 3 } as const
    for (const [c, r] of [[2, 3], [3, 2], [0, 0], [3, 3], [7, 1]]) {
      const old = evaluatePeriod(W1, f, dates(c), dates(r))
      const r1 = evaluateItems(W1, [item('a')], new Map([['a', { creator: dates(c), rival: dates(r) }]]))
      expect({ creatorFailed: r1.creatorFailed, rivalFailed: r1.rivalFailed }).toEqual(old)
    }
  })
  test('diario con un ítem también es paridad', () => {
    const day = { start: '2026-11-23', end: '2026-11-23' }
    const it = item('a', { frequency: { type: 'daily' } })
    const r = evaluateItems(day, [it], new Map([['a', { creator: ['2026-11-23'], rival: [] }]]))
    expect(r).toMatchObject({ creatorFailed: false, rivalFailed: true })
  })
  test('un jugador pierde si falla CUALQUIER ítem', () => {
    const items = [item('a'), item('b')]
    const m = new Map([
      ['a', { creator: dates(3), rival: dates(3) }],
      ['b', { creator: dates(1), rival: dates(3) }],
    ])
    const r = evaluateItems(W1, items, m)
    expect(r.creatorFailed).toBe(true)
    expect(r.rivalFailed).toBe(false)
  })
  test('gana solo si cumple todos', () => {
    const m = new Map([
      ['a', { creator: dates(3), rival: dates(3) }],
      ['b', { creator: dates(3), rival: dates(3) }],
    ])
    expect(evaluateItems(W1, [item('a'), item('b')], m)).toMatchObject({ creatorFailed: false, rivalFailed: false })
  })
  test('un ítem que aún no empieza no cuenta ni deja resultados', () => {
    const late = item('b', { startsOn: '2026-11-30' })
    const m = new Map([
      ['a', { creator: dates(3), rival: dates(3) }],
      ['b', { creator: [], rival: [] }],
    ])
    const r = evaluateItems(W1, [item('a'), late], m)
    expect(r.creatorFailed).toBe(false)
    expect(r.results.every((x) => x.itemId === 'a')).toBe(true)
    expect(r.results).toHaveLength(2)
  })
  test('sin ítems aplicables nadie falla', () => {
    const r = evaluateItems(W1, [item('a', { startsOn: '2026-12-07' })], new Map())
    expect(r).toEqual({ creatorFailed: false, rivalFailed: false, results: [] })
  })
  test('cada ítem usa su propia meta semanal', () => {
    const items = [item('a', { frequency: { type: 'weekly', target: 2 } }), item('b', { frequency: { type: 'weekly', target: 5 } })]
    const m = new Map([
      ['a', { creator: dates(2), rival: dates(2) }],
      ['b', { creator: dates(3), rival: dates(5) }],
    ])
    const r = evaluateItems(W1, items, m)
    expect(r.creatorFailed).toBe(true)
    expect(r.rivalFailed).toBe(false)
    expect(r.results.find((x) => x.itemId === 'b' && x.side === 'creator')).toEqual({ itemId: 'b', side: 'creator', met: false, done: 3, needed: 5 })
    expect(r.results.find((x) => x.itemId === 'a' && x.side === 'rival')).toEqual({ itemId: 'a', side: 'rival', met: true, done: 2, needed: 2 })
  })
  test('devuelve done y needed; los días repetidos y fuera de rango no cuentan', () => {
    const it = item('a')
    const r = evaluateItems(W1, [it], new Map([['a', { creator: ['2026-11-23', '2026-11-23', '2026-11-22', '2026-11-30', '2026-11-24'], rival: [] }]]))
    expect(r.results.find((x) => x.side === 'creator')).toEqual({ itemId: 'a', side: 'creator', met: false, done: 2, needed: 3 })
    expect(r.results.find((x) => x.side === 'rival')).toEqual({ itemId: 'a', side: 'rival', met: false, done: 0, needed: 3 })
  })
  test('diario: needed 1', () => {
    const day = { start: '2026-11-23', end: '2026-11-23' }
    const r = evaluateItems(day, [item('a', { frequency: { type: 'daily' } })], new Map([['a', { creator: ['2026-11-23'], rival: [] }]]))
    expect(r.results).toContainEqual({ itemId: 'a', side: 'creator', met: true, done: 1, needed: 1 })
  })
  test('un ítem sin fechas cargadas se trata como cero', () => {
    const r = evaluateItems(W1, [item('a')], new Map())
    expect(r).toMatchObject({ creatorFailed: true, rivalFailed: true })
  })
})

describe('itemAppliesTo', () => {
  test('cuenta desde su starts_on, inclusive', () => {
    const it = item('a', { startsOn: '2026-11-30' })
    expect(itemAppliesTo(it, W1)).toBe(false)
    expect(itemAppliesTo(it, { start: '2026-11-30', end: '2026-12-06' })).toBe(true)
    expect(itemAppliesTo(it, { start: '2026-12-07', end: '2026-12-13' })).toBe(true)
  })
})

describe('nextItemStart (espejo de next_item_start en SQL)', () => {
  const daily = (today: string, startsOn = '2026-11-10', weeks = 2) => nextItemStart(startsOn, weeks, 'daily', today)
  const weekly = (today: string, startsOn = '2026-11-10', weeks = 4) => nextItemStart(startsOn, weeks, 'weekly', today)
  test('diario: mañana', () => expect(daily('2026-11-12')).toBe('2026-11-13'))
  test('diario antes del inicio: el inicio', () => expect(daily('2026-11-01')).toBe('2026-11-10'))
  test('diario: el día antes del inicio también es el inicio', () => expect(daily('2026-11-09')).toBe('2026-11-10'))
  test('diario: último día del reto no deja período', () => {
    expect(daily('2026-11-23')).toBeNull() // last day is 11-23 (start + 14 - 1): tomorrow is past it
    expect(daily('2026-11-22')).toBe('2026-11-23')
  })
  test('semanal: el inicio del siguiente período', () => expect(weekly('2026-11-12')).toBe('2026-11-17'))
  test('semanal: el primer día del período 1 salta al período 2', () => expect(weekly('2026-11-10')).toBe('2026-11-17'))
  test('semanal: el día antes del inicio es el inicio', () => expect(weekly('2026-11-09')).toBe('2026-11-10'))
  test('semanal: el último día de un período (domingo) apunta al lunes siguiente', () => expect(weekly('2026-11-16')).toBe('2026-11-17'))
  test('semanal antes del inicio: el inicio', () => expect(weekly('2026-10-01')).toBe('2026-11-10'))
  test('semanal: en el último período no queda lugar', () => {
    expect(weekly('2026-12-01')).toBeNull() // period 4 starts 12-01
    expect(weekly('2026-11-24')).toBe('2026-12-01')
  })
  test('semanal: reto terminado', () => expect(weekly('2027-02-01')).toBeNull())
})
