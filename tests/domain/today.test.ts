import { describe, expect, it } from 'vitest'
import { buildToday, habitSubtitle } from '@/domain/today'

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
})
