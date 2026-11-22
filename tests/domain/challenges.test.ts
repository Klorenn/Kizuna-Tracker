import { describe, expect, test } from 'vitest'
import {
  challengeStartDate, periodsFor, evaluatePeriod, isPeriodClosable, canReject,
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
