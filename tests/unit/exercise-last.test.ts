import { describe, expect, test } from 'vitest'
import type { WorkoutSet } from '@/domain/logs'
import { lastSessionSets } from '@/lib/exercise-last'

const set = (sessionId: string, date: string, exerciseId: string, reps: number, kg: number): WorkoutSet => ({
  sessionId,
  date,
  exerciseId,
  reps,
  kg,
})

describe('lastSessionSets', () => {
  test('solo las series de una sesión, no de dos del mismo día', () => {
    const sets = [
      set('s1', '2026-11-22', 'squat', 5, 70),
      set('s2', '2026-11-22', 'squat', 5, 80),
      set('s2', '2026-11-22', 'squat', 5, 85),
      set('s2', '2026-11-22', 'press', 10, 120),
    ]
    expect(lastSessionSets(sets, 'squat', '2026-11-22')).toEqual([
      { reps: 5, kg: 80 },
      { reps: 5, kg: 85 },
    ])
  })

  test('ignora otros días y otros ejercicios; sin series devuelve vacío', () => {
    const sets = [set('s1', '2026-11-20', 'squat', 8, 60), set('s2', '2026-11-22', 'press', 10, 120)]
    expect(lastSessionSets(sets, 'squat', '2026-11-22')).toEqual([])
    expect(lastSessionSets(sets, 'squat', '2026-11-20')).toEqual([{ reps: 8, kg: 60 }])
  })
})
