import { describe, expect, test } from 'vitest'
import { addDays } from '@/domain/dates'
import { goalProgress, goalProgressFromCount, goalWindow, validateGoal } from '@/domain/goals'

const today = '2026-11-25' // miércoles

describe('goalProgress', () => {
  test('semanal cuenta fechas distintas de la semana lunes a domingo', () => {
    expect(
      goalProgress(
        { id: 'g', habitId: 'h', kind: 'weekly', target: 5 },
        ['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-25'],
        today,
      ),
    ).toEqual({ current: 3, target: 5, status: 'in_progress' })
  })
  test('semanal cumplida', () => {
    expect(
      goalProgress({ id: 'g', habitId: 'h', kind: 'weekly', target: 3 }, ['2026-11-23', '2026-11-24', '2026-11-25'], today)
        .status,
    ).toBe('done')
  })
  const dates37 = Array.from({ length: 37 }, (_, i) => addDays('2026-08-01', i))
  test('total ignora fechas anteriores al inicio', () => {
    expect(
      goalProgress(
        { id: 'g', habitId: 'h', kind: 'total', target: 100, startsOn: '2026-08-01', deadline: null },
        [...dates37, '2026-07-31'],
        today,
      ),
    ).toEqual({ current: 37, target: 100, status: 'in_progress' })
  })
  test('total vencida si pasó la fecha límite sin llegar', () => {
    expect(
      goalProgress(
        { id: 'g', habitId: 'h', kind: 'total', target: 100, startsOn: '2026-08-01', deadline: '2026-11-20' },
        dates37,
        today,
      ).status,
    ).toBe('overdue')
  })
  test('total ignora fechas posteriores a la fecha límite y cumplida llega al objetivo', () => {
    const g = { id: 'g', habitId: 'h', kind: 'total' as const, target: 2, startsOn: '2026-11-01', deadline: '2026-11-10' }
    expect(goalProgress(g, ['2026-11-02', '2026-11-03', '2026-11-12'], today)).toEqual({
      current: 2,
      target: 2,
      status: 'done',
    })
  })
})

describe('validateGoal', () => {
  test('fecha límite pasada', () => {
    expect(validateGoal({ kind: 'total', target: 100, deadline: '2026-11-24' }, today)).toEqual({
      ok: false,
      error: 'La fecha límite ya pasó.',
    })
  })
  test('semanal máximo 7', () => {
    expect(validateGoal({ kind: 'weekly', target: 8, deadline: null }, today).ok).toBe(false)
  })
  test('semanal sin fecha límite', () => {
    expect(validateGoal({ kind: 'weekly', target: 3, deadline: '2026-12-01' }, today).ok).toBe(false)
  })
  test('cantidad positiva y entera', () => {
    expect(validateGoal({ kind: 'total', target: 0, deadline: null }, today).ok).toBe(false)
    expect(validateGoal({ kind: 'total', target: 1.5, deadline: null }, today).ok).toBe(false)
  })
  test('válidas', () => {
    expect(validateGoal({ kind: 'weekly', target: 5, deadline: null }, today)).toEqual({ ok: true })
    expect(validateGoal({ kind: 'total', target: 100, deadline: today }, today)).toEqual({ ok: true })
  })
})

describe('goalWindow', () => {
  test('semanal: lunes a domingo de la semana actual', () => {
    expect(goalWindow({ id: 'g', habitId: 'h', kind: 'weekly', target: 3 }, today)).toEqual({
      from: '2026-11-23',
      to: '2026-11-29',
    })
  })
  test('total: desde startsOn hasta la fecha límite, o hasta hoy sin ella', () => {
    const g = { id: 'g', habitId: 'h', kind: 'total' as const, target: 5, startsOn: '2026-08-01' }
    expect(goalWindow({ ...g, deadline: '2026-12-31' }, today)).toEqual({ from: '2026-08-01', to: '2026-12-31' })
    expect(goalWindow({ ...g, deadline: null }, today)).toEqual({ from: '2026-08-01', to: today })
  })
  test('progreso desde un conteo coincide con el de fechas', () => {
    const g = { id: 'g', habitId: 'h', kind: 'total' as const, target: 100, startsOn: '2026-08-01', deadline: '2026-11-20' }
    expect(goalProgressFromCount(g, 37, today)).toEqual({ current: 37, target: 100, status: 'overdue' })
    expect(goalProgressFromCount(g, 100, today).status).toBe('done')
  })
})
