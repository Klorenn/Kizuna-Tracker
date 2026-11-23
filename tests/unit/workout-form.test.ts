import { describe, expect, it } from 'vitest'
import {
  draftFromFields,
  exercisesFromRows,
  fieldsFromDraft,
  kgField,
  nextSet,
} from '@/lib/workout-form'

describe('nextSet', () => {
  it('copies the previous set', () => {
    expect(nextSet([{ reps: '5', kg: '80' }, { reps: '4', kg: '82,5' }])).toEqual({ reps: '4', kg: '82,5' })
  })
  it('starts empty when there is none', () => {
    expect(nextSet([])).toEqual({ reps: '', kg: '' })
  })
})

describe('kgField', () => {
  it('shows a decimal comma and no trailing zeros', () => {
    expect(kgField(42.5)).toBe('42,5')
    expect(kgField(80)).toBe('80')
    expect(kgField(0)).toBe('0')
    expect(kgField(2.25)).toBe('2,25')
  })
})

describe('draftFromFields', () => {
  it('parses reps and kg with comma or point', () => {
    const r = draftFromFields({
      dayTypes: ['legs'],
      exercises: [{ exerciseId: 'sq', sets: [{ reps: '5', kg: '42,5' }, { reps: '8', kg: '40.25' }] }],
    })
    expect(r).toEqual({
      ok: true,
      draft: {
        dayTypes: ['legs'],
        exercises: [{ exerciseId: 'sq', sets: [{ reps: 5, kg: 42.5 }, { reps: 8, kg: 40.25 }] }],
      },
    })
  })
  it('keeps 0 kg (bodyweight)', () => {
    const r = draftFromFields({ dayTypes: ['chest'], exercises: [{ exerciseId: 'p', sets: [{ reps: '12', kg: '0' }] }] })
    expect(r.ok && r.draft.exercises[0].sets[0].kg).toBe(0)
  })
  it.each([
    [{ reps: '', kg: '10' }, 'Las repeticiones van de 1 a 1000.'],
    [{ reps: '0', kg: '10' }, 'Las repeticiones van de 1 a 1000.'],
    [{ reps: '5,5', kg: '10' }, 'Las repeticiones van de 1 a 1000.'],
    [{ reps: '5', kg: 'abc' }, 'El peso va de 0 a 999,99 kg.'],
    [{ reps: '5', kg: '1000' }, 'El peso va de 0 a 999,99 kg.'],
    [{ reps: '5', kg: '' }, 'Escribe el peso de cada serie (0 si es tu peso corporal).'],
  ])('rejects bad fields %o', (set, error) => {
    expect(draftFromFields({ dayTypes: ['legs'], exercises: [{ exerciseId: 'sq', sets: [set] }] })).toEqual({
      ok: false,
      error,
    })
  })
})

describe('fieldsFromDraft', () => {
  it('round-trips a saved draft into form strings', () => {
    expect(
      fieldsFromDraft({ dayTypes: ['legs', 'core'], exercises: [{ exerciseId: 'sq', sets: [{ reps: 5, kg: 42.5 }] }] }),
    ).toEqual({ dayTypes: ['legs', 'core'], exercises: [{ exerciseId: 'sq', sets: [{ reps: '5', kg: '42,5' }] }] })
  })
})

describe('exercisesFromRows', () => {
  it('groups sets by exercise in saved order', () => {
    const rows = [
      { exercise_id: 'b', reps: 10, weight_kg: 120, position: 2 },
      { exercise_id: 'a', reps: 5, weight_kg: 80, position: 0 },
      { exercise_id: 'a', reps: 5, weight_kg: 82.5, position: 1 },
    ]
    expect(exercisesFromRows(rows)).toEqual([
      { exerciseId: 'a', sets: [{ reps: 5, kg: 80 }, { reps: 5, kg: 82.5 }] },
      { exerciseId: 'b', sets: [{ reps: 10, kg: 120 }] },
    ])
  })
})
