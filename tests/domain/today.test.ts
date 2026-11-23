import { describe, expect, it } from 'vitest'
import type { TodayLog } from '@/domain/logs'
import { buildToday, habitSubtitle, undoLosesCopy } from '@/domain/today'

const habit = (o: Partial<Parameters<typeof buildToday>[0]['habits'][number]> = {}) => ({
  id: 'h1',
  name: 'Leer',
  icon: 'book',
  visibility: 'friends',
  requires_photo: false,
  frequency_type: 'daily',
  target_per_week: null,
  ...o,
})

describe('buildToday', () => {
  it('carries the habit color, defaulting to indigo when missing or unknown', () => {
    const r = buildToday({
      habits: [habit({ color: 'salvia' }), habit({ id: 'h2', color: 'neon' }), habit({ id: 'h3' })],
      items: [],
      checkins: [],
      itemChecks: [],
      today: '2026-11-22',
      timeZone: 'America/Santiago',
    })
    expect(r.rows.map((x) => x.color)).toEqual(['salvia', 'indigo', 'indigo'])
  })

  it('marks done, streak and totals for daily habits', () => {
    const r = buildToday({
      habits: [habit(), habit({ id: 'h2', name: 'Agua' })],
      items: [],
      checkins: [
        { habit_id: 'h1', local_date: '2026-11-22' },
        { habit_id: 'h1', local_date: '2026-11-21' },
      ],
      itemChecks: [],
      today: '2026-11-22',
      timeZone: 'America/Santiago',
    })
    expect(r.rows[0]).toMatchObject({ id: 'h1', done: true, streak: 2 })
    expect(r.rows[1]).toMatchObject({ id: 'h2', done: false, streak: 0 })
    expect(r).toMatchObject({ doneCount: 1, total: 2, bestDailyStreak: 2 })
  })

  it('counts weekly habits within the Monday-Sunday week', () => {
    const r = buildToday({
      habits: [habit({ id: 'g', frequency_type: 'weekly', target_per_week: 4 })],
      items: [],
      checkins: [
        { habit_id: 'g', local_date: '2026-11-16' },
        { habit_id: 'g', local_date: '2026-11-18' },
        { habit_id: 'g', local_date: '2026-11-15' },
      ],
      itemChecks: [],
      today: '2026-11-22',
      timeZone: 'America/Santiago',
    })
    expect(r.rows[0].weekCount).toBe(2)
    expect(r.rows[0].done).toBe(false)
    expect(habitSubtitle(r.rows[0])).toBe('2 de 4 esta semana')
  })

  it('attaches items in order with check state and time', () => {
    const r = buildToday({
      habits: [habit({ id: 'e', name: 'Comer bien' })],
      items: [
        { id: 'i2', habit_id: 'e', label: 'Almuerzo', position: 1, requires_photo: false },
        { id: 'i1', habit_id: 'e', label: 'Desayuno', position: 0, requires_photo: false },
      ],
      checkins: [],
      itemChecks: [{ item_id: 'i1', local_date: '2026-11-22', created_at: '2026-11-22T11:12:00Z' }],
      today: '2026-11-22',
      timeZone: 'America/Santiago',
    })
    expect(r.rows[0].items.map((i) => i.label)).toEqual(['Desayuno', 'Almuerzo'])
    expect(r.rows[0].items[0]).toMatchObject({ checked: true, time: '8:12' })
    expect(r.rows[0].items[1]).toMatchObject({ checked: false, time: null })
    expect(habitSubtitle(r.rows[0])).toBe('Diario · 2 pasos')
  })

  const base = { items: [], itemChecks: [], today: '2026-11-22', timeZone: 'America/Santiago' }

  it('carries the log type and today\'s reading log, which becomes the subtitle', () => {
    const r = buildToday({
      ...base,
      habits: [habit({ log_type: 'reading' })],
      checkins: [{ habit_id: 'h1', local_date: '2026-11-22' }],
      logs: { h1: { kind: 'reading', pages: 26, bookTitle: 'Dune' } },
    })
    expect(r.rows[0].logType).toBe('reading')
    expect(r.rows[0].log).toEqual({ kind: 'reading', pages: 26, bookTitle: 'Dune' })
    expect(habitSubtitle(r.rows[0])).toBe('26 páginas · Dune')
  })

  it('without a log the subtitle stays the frequency', () => {
    const r = buildToday({ ...base, habits: [habit({ log_type: 'reading' })], checkins: [], logs: {} })
    expect(r.rows[0].log).toBeNull()
    expect(r.rows[0].logType).toBe('reading')
    expect(habitSubtitle(r.rows[0])).toBe('Diario')
  })

  it('workout logs read "Pierna · 5 ejercicios"; unknown or missing log types are none', () => {
    const r = buildToday({
      ...base,
      habits: [habit({ id: 'g', log_type: 'workout' }), habit({ id: 'x', log_type: 'weird' }), habit({ id: 'y' })],
      checkins: [],
      logs: { g: { kind: 'workout', dayTypes: ['legs'], exerciseCount: 5 } },
    })
    expect(habitSubtitle(r.rows[0])).toBe('Pierna · 5 ejercicios')
    expect(r.rows.map((x) => x.logType)).toEqual(['workout', 'none', 'none'])
  })

  it('with a reading and a workout on the same habit, the one matching log_type wins, else the first', () => {
    const reading: TodayLog = { kind: 'reading', pages: 26, bookTitle: 'Dune' }
    const workout: TodayLog = { kind: 'workout', dayTypes: ['legs'], exerciseCount: 3 }
    const r = buildToday({
      ...base,
      habits: [habit({ id: 'a', log_type: 'reading' }), habit({ id: 'b', log_type: 'workout' }), habit({ id: 'c', log_type: 'none' })],
      checkins: [],
      logs: { a: [workout, reading], b: [reading, workout], c: [reading, workout] },
    })
    expect(r.rows.map((x) => x.log?.kind)).toEqual(['reading', 'workout', 'reading'])
  })
})

describe('v4 rows', () => {
  const base = { items: [], itemChecks: [], today: '2026-11-22', timeZone: 'America/Santiago' }
  const water = {
    id: 'w',
    name: 'Agua',
    log_type: 'quantity',
    quantity_unit: 'ml',
    quantity_label: null,
    quantity_target: 2000,
    quantity_step: 250,
    quantity_display: 'glasses',
    glass_ml: 250,
  }

  it('a quantity habit is done only with a check-in, never by its total', () => {
    const entries = { w: [{ id: 'e1', amount: 1250, at: '2026-11-22T12:00:00Z' }] }
    const open = buildToday({ ...base, habits: [habit(water)], checkins: [], quantity: entries })
    expect(open.rows[0].done).toBe(false)
    expect(open.rows[0].quantity).toEqual({
      config: { unit: 'ml', label: null, target: 2000, step: 250, display: 'glasses', glassMl: 250 },
      total: 1250,
      entries: entries.w,
    })
    expect(habitSubtitle(open.rows[0])).toBe('5 de 8 vasos')
    expect(open.doneCount).toBe(0)
    const met = buildToday({
      ...base,
      habits: [habit(water)],
      checkins: [{ habit_id: 'w', local_date: '2026-11-22' }],
      quantity: { w: [{ id: 'e1', amount: 2000, at: '2026-11-22T12:00:00Z' }] },
    })
    expect(met.rows[0].done).toBe(true)
    expect(habitSubtitle(met.rows[0])).toBe('Meta de hoy cumplida · 8 de 8 vasos')
  })

  it('a quantity habit without entries shows 0 and other types carry no quantity', () => {
    const r = buildToday({ ...base, habits: [habit(water), habit({ id: 'x', log_type: 'time' })], checkins: [] })
    expect(habitSubtitle(r.rows[0])).toBe('0 de 8 vasos')
    expect(r.rows[1].quantity).toBeNull()
    expect(r.rows[0].log).toBeNull()
  })

  it('time log: "1 h 25 min · Álgebra"', () => {
    const r = buildToday({
      ...base,
      habits: [habit({ id: 's', name: 'Estudiar', log_type: 'time' })],
      checkins: [{ habit_id: 's', local_date: '2026-11-22' }],
      logs: { s: { kind: 'time', minutes: 85, topic: 'Álgebra' } },
    })
    expect(habitSubtitle(r.rows[0])).toBe('1 h 25 min · Álgebra')
  })

  it('a time habit that also has an old reading shows the time', () => {
    const r = buildToday({
      ...base,
      habits: [habit({ id: 's', log_type: 'time' })],
      checkins: [],
      logs: {
        s: [
          { kind: 'reading', pages: 3, bookTitle: 'Dune' },
          { kind: 'time', minutes: 30, topic: null },
        ],
      },
    })
    expect(habitSubtitle(r.rows[0])).toBe('30 min')
  })
})

describe('undoLosesCopy', () => {
  const row = (o: Partial<ReturnType<typeof buildToday>['rows'][number]>) =>
    ({ ...buildToday({ habits: [habit()], items: [], checkins: [], itemChecks: [], today: '2026-11-22', timeZone: 'UTC' }).rows[0], ...o })

  it('asks whenever a log exists, naming the log that is actually there', () => {
    expect(undoLosesCopy(row({ logType: 'reading', log: { kind: 'reading', pages: 3, bookTitle: 'Dune' } }))).toBe(
      'Se borrará también la lectura de hoy.',
    )
    // the log type changed since: the old workout still goes with the check-in
    expect(undoLosesCopy(row({ logType: 'none', log: { kind: 'workout', dayTypes: ['legs'], exerciseCount: 1 } }))).toBe(
      'Se borrará también el entrenamiento de hoy.',
    )
    expect(undoLosesCopy(row({ logType: 'workout', log: { kind: 'reading', pages: 3, bookTitle: 'Dune' } }))).toBe(
      'Se borrará también la lectura de hoy.',
    )
  })

  it('names the time, what you watched and the outings', () => {
    expect(undoLosesCopy(row({ log: { kind: 'time', minutes: 85, topic: null } }))).toBe(
      'Se borrará también el tiempo de hoy (1 h 25 min).',
    )
    expect(
      undoLosesCopy(
        row({ log: { kind: 'watch', title: 'Dark', mediaKind: 'series', episodes: 3, minutes: null, completed: false } }),
      ),
    ).toBe('Se borrará también lo que viste hoy.')
    const out = { distanceM: 2500, durationS: 1800, kind: 'walk' as const }
    expect(undoLosesCopy(row({ log: { kind: 'cardio', entries: [out] } }))).toBe('Se borrará también la salida de hoy.')
    expect(undoLosesCopy(row({ log: { kind: 'cardio', entries: [out, out] } }))).toBe(
      'Se borrarán también las 2 salidas de hoy.',
    )
  })

  it('does not ask without a log', () => {
    expect(undoLosesCopy(row({ logType: 'reading', log: null }))).toBeNull()
  })
})
