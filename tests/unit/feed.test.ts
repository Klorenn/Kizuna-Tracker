import { describe, expect, test } from 'vitest'
import {
  actionCopy,
  feedDayLabel,
  groupByDay,
  isMilestone,
  parseCursor,
  reviewStatus,
  streakContext,
} from '@/lib/feed'

describe('feedDayLabel', () => {
  test('hoy y ayer relativos al día del que mira', () => {
    expect(feedDayLabel('2026-11-22', '2026-11-22')).toBe('Hoy')
    expect(feedDayLabel('2026-11-21', '2026-11-22')).toBe('Ayer')
  })
  test('otros días: día de la semana, número y mes cortos (la etiqueta mono los pone en mayúsculas)', () => {
    expect(feedDayLabel('2026-11-20', '2026-11-22')).toBe('Vie 20 nov')
    expect(feedDayLabel('2026-11-16', '2026-11-22')).toBe('Lun 16 nov')
  })
  test('agrega el año cuando no es el actual', () => {
    expect(feedDayLabel('2025-12-29', '2026-01-03')).toBe('Lun 29 dic 2025')
  })
})

describe('groupByDay', () => {
  const items = [
    { id: '1', localDate: '2026-11-22' },
    { id: '2', localDate: '2026-11-22' },
    { id: '3', localDate: '2026-11-21' },
    { id: '4', localDate: '2026-11-18' },
  ]
  test('agrupa en orden de llegada con etiqueta por día', () => {
    const g = groupByDay(items, '2026-11-22')
    expect(g.map((x) => [x.label, x.items.map((i) => i.id), x.continued])).toEqual([
      ['Hoy', ['1', '2'], false],
      ['Ayer', ['3'], false],
      ['Mié 18 nov', ['4'], false],
    ])
  })
  test('una página que sigue el mismo día de la anterior no repite la etiqueta', () => {
    const g = groupByDay(items.slice(2), '2026-11-22', '2026-11-21')
    expect(g[0]).toMatchObject({ date: '2026-11-21', continued: true })
    expect(g[1]).toMatchObject({ date: '2026-11-18', continued: false })
  })
  test('lista vacía', () => {
    expect(groupByDay([], '2026-11-22')).toEqual([])
  })
})

describe('actionCopy', () => {
  test('registro simple', () => {
    expect(actionCopy('Leer', { kind: 'done' })).toBe('Completó Leer')
  })
  test('con foto', () => {
    expect(actionCopy('Gimnasio', { kind: 'photo' })).toBe('Subió su foto de Gimnasio')
  })
  test('hábito con ítems', () => {
    expect(actionCopy('Comer bien', { kind: 'items', done: 4, total: 4 })).toBe('Comer bien · 4 de 4')
  })
})

describe('milestones and streak context', () => {
  test('hitos en 7, 14, 21, 30, 50 y 100', () => {
    expect([6, 7, 14, 21, 22, 30, 50, 100, 101].filter(isMilestone)).toEqual([7, 14, 21, 30, 50, 100])
  })
  const run = (end: string, n: number) =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(`${end}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() - i)
      return d.toISOString().slice(0, 10)
    })
  test('racha diaria a la fecha del registro, con hito', () => {
    expect(streakContext(run('2026-11-22', 21), '2026-11-22', { type: 'daily' })).toEqual({
      text: 'Racha de 21 días',
      milestone: true,
    })
  })
  test('ignora registros posteriores al que se muestra', () => {
    expect(streakContext(run('2026-11-22', 8), '2026-11-21', { type: 'daily' })).toEqual({
      text: 'Racha de 7 días',
      milestone: true,
    })
  })
  test('rachas cortas no se destacan', () => {
    expect(streakContext(run('2026-11-22', 2), '2026-11-22', { type: 'daily' })).toBeNull()
    expect(streakContext(run('2026-11-22', 5), '2026-11-22', { type: 'daily' })).toEqual({
      text: 'Racha de 5 días',
      milestone: false,
    })
  })
  test('hábitos semanales cuentan semanas cumplidas', () => {
    // three weeks with 2 check-ins each, target 2
    const dates = ['2026-11-09', '2026-11-10', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']
    expect(streakContext(dates, '2026-11-19', { type: 'weekly', target: 2 })).toEqual({
      text: 'Racha de 2 semanas',
      milestone: false,
    })
  })
})

describe('streakContext with a bounded history window', () => {
  const run = (end: string, n: number) =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(`${end}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() - i)
      return d.toISOString().slice(0, 10)
    })
  const at = '2026-11-22'
  test('a streak that reaches the start of the window is shown with "+" and never as a milestone', () => {
    // 100 loaded days from 2026-08-15: the real streak may be longer
    const since = '2026-08-15'
    expect(streakContext(run(at, 100), at, { type: 'daily' }, since)).toEqual({
      text: 'Racha de 100+ días',
      milestone: false,
    })
  })
  test('a streak that ends inside the window is exact, milestone included', () => {
    expect(streakContext(run(at, 100), at, { type: 'daily' }, '2026-06-01')).toEqual({
      text: 'Racha de 100 días',
      milestone: true,
    })
  })
  test('weekly streaks that fill the window are capped too', () => {
    const dates = run(at, 113) // every day from 2026-08-01
    const out = streakContext(dates, at, { type: 'weekly', target: 1 }, '2026-08-01')
    expect(out?.text).toMatch(/^Racha de \d+\+ semanas$/)
    expect(out?.milestone).toBe(false)
  })
})

describe('reviewStatus', () => {
  const me = 'me'
  const challenge = {
    id: 'c1',
    creator_id: 'me',
    rival_id: 'beto',
    creator_habit_id: 'h-me',
    rival_habit_id: 'h-beto',
    status: 'active',
    requires_photo: true,
    starts_on: '2026-11-16',
    weeks: 2,
  }
  const now = new Date('2026-11-22T12:00:00Z')
  const checkin = {
    user_id: 'beto',
    habit_id: 'h-beto',
    local_date: '2026-11-22',
    created_at: '2026-11-22T09:30:00Z',
    photo_path: 'beto/x.jpg',
    rejected_at: null,
    rejected_by: null,
  }
  test('foto de mi rival dentro del reto y de las 24 h: se aprueba sola en N h', () => {
    expect(reviewStatus(checkin, me, [challenge], now)).toEqual({ kind: 'pending', hours: 22, challengeId: 'c1' })
  })
  test('no aplica si no soy su rival en un reto con foto', () => {
    expect(reviewStatus(checkin, me, [{ ...challenge, requires_photo: false }], now)).toBeNull()
    expect(reviewStatus(checkin, me, [{ ...challenge, rival_habit_id: 'otro' }], now)).toBeNull()
    expect(reviewStatus(checkin, me, [{ ...challenge, status: 'finished' }], now)).toBeNull()
    expect(reviewStatus({ ...checkin, photo_path: null }, me, [challenge], now)).toBeNull()
  })
  test('fuera de la ventana de 24 h o fuera de las fechas del reto', () => {
    expect(reviewStatus({ ...checkin, created_at: '2026-11-21T11:00:00Z' }, me, [challenge], now)).toBeNull()
    expect(reviewStatus({ ...checkin, local_date: '2026-11-15' }, me, [challenge], now)).toBeNull()
  })
  test('rechazada', () => {
    expect(
      reviewStatus({ ...checkin, rejected_at: '2026-11-22T10:00:00Z', rejected_by: 'me' }, me, [challenge], now),
    ).toEqual({ kind: 'rejected', byMe: true })
    expect(
      reviewStatus({ ...checkin, rejected_at: '2026-11-22T10:00:00Z', rejected_by: 'otro' }, me, [], now),
    ).toEqual({ kind: 'rejected', byMe: false })
  })
})

describe('parseCursor', () => {
  const id = '22222222-2222-4222-8222-222222222222'
  test('acepta día local, instante ISO y uuid', () => {
    const c = { day: '2026-11-22', at: '2026-11-22T13:45:01.123456+00:00', id }
    expect(parseCursor(c)).toEqual(c)
  })
  test('rechaza cualquier otra cosa', () => {
    expect(parseCursor(null)).toBeNull()
    expect(parseCursor({ day: '2026-11-22', at: 'x),or(id.gt.0', id })).toBeNull()
    expect(parseCursor({ day: '2026-11-22', at: '2026-11-22T13:45:01Z', id: 'nope' })).toBeNull()
    expect(parseCursor({ day: '22-11-2026', at: '2026-11-22T13:45:01Z', id })).toBeNull()
    expect(parseCursor({ at: '2026-11-22T13:45:01Z', id })).toBeNull()
  })
})
