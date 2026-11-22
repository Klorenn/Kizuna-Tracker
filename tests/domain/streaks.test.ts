import { describe, expect, test } from 'vitest'
import { dailyStreak, weeklyStreak, bestStreak } from '@/domain/streaks'

describe('streaks', () => {
  test('racha diaria: hoy pendiente no corta', () => {
    expect(dailyStreak(['2026-11-20', '2026-11-21'], '2026-11-22')).toBe(2)
  })
  test('racha diaria: incluye hoy si está hecho', () => {
    expect(dailyStreak(['2026-11-20', '2026-11-21', '2026-11-22'], '2026-11-22')).toBe(3)
  })
  test('racha diaria: hueco de ayer la corta', () => {
    expect(dailyStreak(['2026-11-19', '2026-11-20'], '2026-11-22')).toBe(0)
  })
  test('racha diaria tolera duplicados y desorden', () => {
    expect(dailyStreak(['2026-11-21', '2026-11-20', '2026-11-21'], '2026-11-22')).toBe(2)
  })
  test('racha semanal: semana actual incompleta no corta', () => {
    const d = ['2026-11-03','2026-11-05','2026-11-07','2026-11-10','2026-11-12','2026-11-14','2026-11-17']
    expect(weeklyStreak(d, 3, '2026-11-18')).toBe(2)
  })
  test('racha semanal: semana pasada bajo la meta corta', () => {
    expect(weeklyStreak(['2026-11-10','2026-11-12'], 3, '2026-11-18')).toBe(0)
  })
  test('mejor racha diaria', () => {
    expect(bestStreak(['2026-11-01','2026-11-02','2026-11-03','2026-11-10'], { type: 'daily' })).toBe(3)
  })
})
