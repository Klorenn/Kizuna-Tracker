import { describe, expect, test } from 'vitest'
import { monthlyCounts, profileStreaks, recordFromRows, streakWindow, weeklyCounts } from '@/lib/stats'

describe('weeklyCounts', () => {
  test('incluye semanas en cero y termina en la semana actual', () => {
    const r = weeklyCounts(['2026-11-23'], 8, '2026-11-25')
    expect(r).toHaveLength(8)
    expect(r.at(-1)).toEqual({ weekStart: '2026-11-23', count: 1 })
    expect(r[0]).toEqual({ weekStart: '2026-10-05', count: 0 })
  })
  test('cuenta fechas distintas', () => {
    expect(weeklyCounts(['2026-11-23', '2026-11-23', '2026-11-24'], 1, '2026-11-25')).toEqual([
      { weekStart: '2026-11-23', count: 2 },
    ])
  })
})

describe('monthlyCounts', () => {
  test('últimos meses en orden con ceros', () => {
    const r = monthlyCounts(['2026-10-05', '2026-11-01', '2026-11-02'], 6, '2026-11-25')
    expect(r).toHaveLength(6)
    expect(r[0]).toEqual({ month: '2026-06', count: 0 })
    expect(r.at(-2)).toEqual({ month: '2026-10', count: 1 })
    expect(r.at(-1)).toEqual({ month: '2026-11', count: 2 })
  })
  test('cruza el año', () => {
    expect(monthlyCounts([], 3, '2026-01-10').map((m) => m.month)).toEqual(['2025-11', '2025-12', '2026-01'])
  })
})

describe('recordFromRows', () => {
  const rows = [
    { id: 'c1', creator_id: 'me', rival_id: 'x', status: 'finished' },
    { id: 'c2', creator_id: 'x', rival_id: 'me', status: 'finished' },
    { id: 'c3', creator_id: 'me', rival_id: 'x', status: 'finished' },
    { id: 'c4', creator_id: 'me', rival_id: 'x', status: 'active' },
  ]
  test('gana con menos fallas que el rival, pierde con más, empate no cuenta', () => {
    const debts = [
      { challenge_id: 'c1', debtor_id: 'x' }, // c1: me 0, x 1 -> gané
      { challenge_id: 'c2', debtor_id: 'me' }, // c2: me 1, x 0 -> perdí
      { challenge_id: 'c3', debtor_id: 'me' },
      { challenge_id: 'c3', debtor_id: 'x' }, // c3: empate
      { challenge_id: 'c4', debtor_id: 'x' }, // activo: no cuenta
    ]
    expect(recordFromRows('me', rows, debts)).toEqual({ won: 1, lost: 1 })
  })
})

describe('streakWindow', () => {
  test('acota por fecha y por filas, siempre bajo el tope de la API', () => {
    const w = streakWindow('2026-11-25')
    expect(w.from).toBe('2025-10-21')
    expect(w.limit).toBeLessThan(1000)
  })
})

describe('profileStreaks', () => {
  const today = '2026-11-25'
  test('considera hábitos semanales y elige el más largo en días equivalentes', () => {
    const daily = { frequency_type: 'daily', target_per_week: null, dates: ['2026-11-24', '2026-11-25'] }
    const weekly = {
      frequency_type: 'weekly',
      target_per_week: 1,
      dates: ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'],
    }
    const r = profileStreaks([daily, weekly], today)
    expect(r.current).toEqual({ value: 4, unit: 'weeks' })
    expect(r.best).toEqual({ value: 4, unit: 'weeks' })
  })
  test('sin hábitos es 0 días', () => {
    expect(profileStreaks([], today).current).toEqual({ value: 0, unit: 'days' })
  })
})
