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
})
