import { parseKg, type DayType, type WorkoutDraft } from '@/domain/logs'

// Form-side state of the workout logger: inputs are strings (so "42," is a valid half-typed
// value); they become numbers only when saving. No I/O.

export type SetFields = { reps: string; kg: string }
export type ExerciseFields = { exerciseId: string; sets: SetFields[] }
export type WorkoutFields = { dayTypes: DayType[]; exercises: ExerciseFields[] }

/** A new set copies the previous one (reps and kg); the first set of an exercise starts empty. */
export function nextSet(sets: SetFields[]): SetFields {
  const last = sets[sets.length - 1]
  return last ? { reps: last.reps, kg: last.kg } : { reps: '', kg: '' }
}

/** 42,5 / 80 / 0: decimal comma, no trailing zeros, no unit (the field carries "kg"). */
export function kgField(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',')
}

export function fieldsFromDraft(d: WorkoutDraft): WorkoutFields {
  return {
    dayTypes: [...d.dayTypes],
    exercises: d.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      sets: e.sets.map((s) => ({ reps: String(s.reps), kg: kgField(s.kg) })),
    })),
  }
}

/** Where a form error is, so the logger can mark that input (aria-invalid) and focus it. */
export type FieldError = { exercise: number; set: number; field: 'reps' | 'kg' }

export function draftFromFields(
  f: WorkoutFields,
): { ok: true; draft: WorkoutDraft } | { ok: false; error: string; at: FieldError } {
  const exercises: WorkoutDraft['exercises'] = []
  for (const [i, e] of f.exercises.entries()) {
    const sets: { reps: number; kg: number }[] = []
    for (const [j, s] of e.sets.entries()) {
      const fail = (error: string, field: FieldError['field']) =>
        ({ ok: false, error, at: { exercise: i, set: j, field } }) as const
      const repsText = s.reps.trim()
      const reps = /^\d{1,4}$/.test(repsText) ? Number(repsText) : NaN
      if (!Number.isInteger(reps) || reps < 1 || reps > 1000) return fail('Las repeticiones van de 1 a 1000.', 'reps')
      if (s.kg.trim() === '') return fail('Escribe el peso de cada serie (0 si es tu peso corporal).', 'kg')
      const kg = parseKg(s.kg)
      if (kg === null) return fail('El peso va de 0 a 999,99 kg.', 'kg')
      sets.push({ reps, kg })
    }
    exercises.push({ exerciseId: e.exerciseId, sets })
  }
  return { ok: true, draft: { dayTypes: [...f.dayTypes], exercises } }
}

/** Rebuilds a saved workout's exercises from its set rows (order of `position`, grouped by exercise). */
export function exercisesFromRows(
  rows: { exercise_id: string; reps: number; weight_kg: number; position: number }[],
): WorkoutDraft['exercises'] {
  const out: WorkoutDraft['exercises'] = []
  for (const r of [...rows].sort((a, b) => a.position - b.position)) {
    let group = out.find((e) => e.exerciseId === r.exercise_id)
    if (!group) {
      group = { exerciseId: r.exercise_id, sets: [] }
      out.push(group)
    }
    group.sets.push({ reps: r.reps, kg: Number(r.weight_kg) })
  }
  return out
}
