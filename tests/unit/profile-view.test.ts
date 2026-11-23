import { describe, expect, test } from 'vitest'
import { activityGrid, debtSummary, lastDays, memberSince, streakText, timezoneLock } from '@/lib/profile-view'

describe('memberSince', () => {
  test('mes corto y año en la zona del usuario', () => {
    expect(memberSince('2026-11-22T10:00:00Z', 'America/Santiago')).toBe('Miembro desde nov 2026')
  })
  test('usa la zona horaria para el borde de mes', () => {
    // 1 dic 02:00 UTC es todavía 30 nov en Santiago (UTC-3)
    expect(memberSince('2026-12-01T02:00:00Z', 'America/Santiago')).toBe('Miembro desde nov 2026')
    expect(memberSince('2026-12-01T02:00:00Z', 'UTC')).toBe('Miembro desde dic 2026')
  })
  test('fecha inválida no muestra nada', () => {
    expect(memberSince('no-es-fecha', 'UTC')).toBeNull()
  })
})

describe('timezoneLock', () => {
  const tz = 'America/Santiago'
  test('sin cambios previos está libre', () => {
    expect(timezoneLock(null, new Date('2026-11-22T12:00:00Z'), tz)).toEqual({ locked: false })
  })
  test('bloqueada hasta 7 días después del último cambio, con fecha local', () => {
    expect(timezoneLock('2026-11-20T15:05:00Z', new Date('2026-11-22T12:00:00Z'), tz)).toEqual({
      locked: true,
      until: '2026-11-27T15:05:00.000Z',
      label: '27 nov, 12:05',
    })
  })
  test('justo a los 7 días ya se puede cambiar (igual que set_timezone)', () => {
    expect(timezoneLock('2026-11-15T15:05:00Z', new Date('2026-11-22T15:05:00Z'), tz)).toEqual({ locked: false })
  })
  test('un valor ilegible no bloquea', () => {
    expect(timezoneLock('x', new Date('2026-11-22T12:00:00Z'), tz)).toEqual({ locked: false })
  })
})

describe('lastDays', () => {
  test('los últimos 7 días, del más antiguo a hoy', () => {
    const r = lastDays(['2026-11-22', '2026-11-20', '2026-11-01'], '2026-11-22')
    expect(r.map((d) => d.date)).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ])
    expect(r.map((d) => d.done)).toEqual([false, false, false, false, true, false, true])
  })
})

describe('activityGrid', () => {
  const today = '2026-11-25' // miércoles
  test('12 columnas de lunes a domingo que terminan en la semana actual', () => {
    const g = activityGrid([], today)
    expect(g.weeks).toHaveLength(12)
    expect(g.weeks.every((w) => w.length === 7)).toBe(true)
    expect(g.weeks[0][0].date).toBe('2026-09-07')
    expect(g.weeks[11][0].date).toBe('2026-11-23')
    expect(g.weeks[11][6]).toMatchObject({ date: '2026-11-29', future: true, level: 0 })
    expect(g.weeks[11][2]).toMatchObject({ date: '2026-11-25', future: false })
  })
  test('la intensidad es la parte de tus hábitos hecha ese día', () => {
    const g = activityGrid(
      [{ dates: ['2026-11-23', '2026-11-24', '2026-11-24'] }, { dates: ['2026-11-23', '2026-01-01'] }],
      today,
    )
    const week = g.weeks[11]
    expect(week[0]).toMatchObject({ date: '2026-11-23', count: 2, level: 4 })
    expect(week[1]).toMatchObject({ date: '2026-11-24', count: 1, level: 2 })
    expect(week[2]).toMatchObject({ count: 0, level: 0 })
    expect(g.total).toBe(3)
    expect(g.activeDays).toBe(2)
  })
  test('niveles con cuatro hábitos', () => {
    const habits = [
      { dates: ['2026-11-23', '2026-11-24'] },
      { dates: ['2026-11-23'] },
      { dates: ['2026-11-23'] },
      { dates: [] },
    ]
    const week = activityGrid(habits, today).weeks[11]
    expect(week[0].level).toBe(3)
    expect(week[1].level).toBe(1)
  })
  test('ignora fechas futuras', () => {
    const g = activityGrid([{ dates: ['2026-11-27'] }], today)
    expect(g.weeks[11][4]).toMatchObject({ future: true, count: 0, level: 0 })
    expect(g.total).toBe(0)
  })
  test('etiqueta de mes en la columna que contiene el día 1', () => {
    expect(activityGrid([], today).monthLabels).toEqual([
      'sep',
      null,
      null,
      'oct',
      null,
      null,
      null,
      'nov',
      null,
      null,
      null,
      null,
    ])
  })
  test('si la segunda columna ya trae mes, la primera queda sin etiqueta', () => {
    // la primera columna es la del 21 sep y la segunda (28 sep) trae el 1 oct
    const labels = activityGrid([], '2026-12-09').monthLabels
    expect(labels[0]).toBe(null)
    expect(labels[1]).toBe('oct')
  })
})

describe('debtSummary', () => {
  test('a favor, en contra y en cero, con signo explícito', () => {
    expect(debtSummary(2500)).toEqual({ amount: '+$2.500', caption: 'te deben' })
    expect(debtSummary(-1500)).toEqual({ amount: '-$1.500', caption: 'debes' })
    expect(debtSummary(0)).toEqual({ amount: '$0', caption: 'sin saldo' })
  })
})

describe('streakText', () => {
  test('singular y plural en días y semanas', () => {
    expect(streakText(1, 'days')).toBe('día')
    expect(streakText(21, 'days')).toBe('días')
    expect(streakText(1, 'weeks')).toBe('semana')
    expect(streakText(0, 'weeks')).toBe('semanas')
  })
})
