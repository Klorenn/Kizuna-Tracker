import { beforeEach, describe, expect, it, vi } from 'vitest'

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] }
const calls: Call[] = []
const rpc = vi.fn()
let insertResult: { data: { id: string } | null; error: { message: string; code?: string } | null }
let updateResult: { data: { id: string }[] | null; error: { message: string; code?: string } | null }
let user: { id: string } | null = { id: 'u1' }

function builder(table: string) {
  return {
    insert: (payload: unknown) => {
      calls.push({ table, op: 'insert', payload, filters: [] })
      return { select: () => ({ single: async () => insertResult }) }
    },
    update: (payload: unknown) => {
      const call: Call = { table, op: 'update', payload, filters: [] }
      calls.push(call)
      const c: Record<string, unknown> = {}
      c.eq = (k: string, v: unknown) => (call.filters.push([k, v]), c)
      c.is = (k: string, v: unknown) => (call.filters.push([k, v]), c)
      c.select = () => c
      c.then = (res: (v: unknown) => unknown) => res(updateResult)
      return c
    },
  }
}

const client = {
  auth: { getUser: async () => ({ data: { user } }) },
  rpc,
  from: (t: string) => builder(t),
}

vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => client }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  archiveExercise,
  createExercise,
  deleteWorkout,
  renameExercise,
  saveWorkout,
} from '@/app/(app)/registros/workout-actions'

beforeEach(() => {
  calls.length = 0
  rpc.mockReset()
  rpc.mockResolvedValue({ data: 'w1', error: null })
  insertResult = { data: { id: 'e1' }, error: null }
  updateResult = { data: [{ id: 'e1' }], error: null }
  user = { id: 'u1' }
})

describe('saveWorkout', () => {
  it('sends the day types and the sets in the entered order', async () => {
    const r = await saveWorkout('c1', {
      dayTypes: ['legs'],
      exercises: [{ exerciseId: 'sq', sets: [{ reps: 5, kg: 80 }] }],
    })
    expect(r).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('save_workout', {
      p_checkin_id: 'c1',
      p_day_types: ['legs'],
      p_sets: [{ exercise_id: 'sq', reps: 5, kg: 80 }],
    })
  })

  it('rejects an empty day-type list without calling the database', async () => {
    const r = await saveWorkout('c1', { dayTypes: [], exercises: [] })
    expect(r).toEqual({ ok: false, error: 'Elige al menos un tipo de día.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('saves a cardio day without exercises', async () => {
    const r = await saveWorkout('c1', { dayTypes: ['cardio'], exercises: [] })
    expect(r).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('save_workout', { p_checkin_id: 'c1', p_day_types: ['cardio'], p_sets: [] })
  })

  it('rejects more than 10 sets per exercise', async () => {
    const sets = Array.from({ length: 11 }, () => ({ reps: 5, kg: 20 }))
    const r = await saveWorkout('c1', { dayTypes: ['legs'], exercises: [{ exerciseId: 'sq', sets }] })
    expect(r).toEqual({ ok: false, error: 'Puedes registrar hasta 10 series por ejercicio.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['invalid_set', 'Revisa las series del entrenamiento.'],
    ['invalid_day_types', 'Revisa las series del entrenamiento.'],
    ['too_many_sets', 'Revisa las series del entrenamiento.'],
    ['checkin_not_found', 'Ese día no tiene check-in.'],
    ['log_type_mismatch', 'Este hábito no lleva ese tipo de registro.'],
    ['exercise_not_found', 'No encontramos ese ejercicio.'],
    ['not_authenticated', 'Inicia sesión para continuar.'],
  ])('maps the RPC error %s to Spanish copy', async (code, copy) => {
    rpc.mockResolvedValue({ data: null, error: { message: code } })
    const r = await saveWorkout('c1', {
      dayTypes: ['legs'],
      exercises: [{ exerciseId: 'sq', sets: [{ reps: 5, kg: 80 }] }],
    })
    expect(r).toEqual({ ok: false, error: copy })
  })

  it('falls back to a generic message for unknown errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const r = await saveWorkout('c1', { dayTypes: ['cardio'], exercises: [] })
    expect(r).toEqual({ ok: false, error: 'No pudimos guardar el entrenamiento. Inténtalo de nuevo.' })
  })
})

describe('deleteWorkout', () => {
  it('calls delete_workout', async () => {
    expect(await deleteWorkout('c1')).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('delete_workout', { p_checkin_id: 'c1' })
  })
  it('maps errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_authenticated' } })
    expect(await deleteWorkout('c1')).toEqual({ ok: false, error: 'Inicia sesión para continuar.' })
  })
})

describe('createExercise', () => {
  it('inserts a trimmed name with its group for the caller', async () => {
    const r = await createExercise({ name: '  Remo Pendlay ', group: 'back' })
    expect(r).toEqual({ ok: true, id: 'e1' })
    expect(calls[0]).toMatchObject({
      table: 'exercises',
      op: 'insert',
      payload: { user_id: 'u1', name: 'Remo Pendlay', muscle_group: 'back' },
    })
  })
  it('requires a name', async () => {
    expect(await createExercise({ name: '   ', group: 'back' })).toEqual({
      ok: false,
      error: 'Ponle un nombre al ejercicio.',
    })
    expect(calls).toHaveLength(0)
  })
  it('limits the name to 60 characters', async () => {
    const r = await createExercise({ name: 'x'.repeat(61), group: 'back' })
    expect(r).toEqual({ ok: false, error: 'El nombre puede tener hasta 60 caracteres.' })
  })
  it('maps a duplicate (23505) to its copy', async () => {
    insertResult = { data: null, error: { message: 'duplicate key', code: '23505' } }
    expect(await createExercise({ name: 'Sentadilla', group: 'legs' })).toEqual({
      ok: false,
      error: 'Ya tienes un ejercicio con ese nombre.',
    })
  })
  it('requires a session', async () => {
    user = null
    expect(await createExercise({ name: 'Remo', group: 'back' })).toEqual({
      ok: false,
      error: 'Inicia sesión para continuar.',
    })
  })
})

describe('renameExercise / archiveExercise', () => {
  it('renames only the own exercise (trimmed)', async () => {
    expect(await renameExercise('e1', ' Remo ')).toEqual({ ok: true })
    expect(calls[0]).toMatchObject({ table: 'exercises', op: 'update', payload: { name: 'Remo' } })
    expect(calls[0].filters).toContainEqual(['id', 'e1'])
    expect(calls[0].filters).toContainEqual(['user_id', 'u1'])
  })
  it('reports a duplicate on rename', async () => {
    updateResult = { data: null, error: { message: 'dup', code: '23505' } }
    expect(await renameExercise('e1', 'Remo')).toEqual({ ok: false, error: 'Ya tienes un ejercicio con ese nombre.' })
  })
  it('reports a missing or catalog exercise (no row updated)', async () => {
    updateResult = { data: [], error: null }
    expect(await renameExercise('cat1', 'Remo')).toEqual({ ok: false, error: 'No encontramos ese ejercicio.' })
    expect(await archiveExercise('cat1')).toEqual({ ok: false, error: 'No encontramos ese ejercicio.' })
  })
  it('validates the new name', async () => {
    expect(await renameExercise('e1', '')).toEqual({ ok: false, error: 'Ponle un nombre al ejercicio.' })
  })
  it('archives with a timestamp', async () => {
    expect(await archiveExercise('e1')).toEqual({ ok: true })
    const payload = calls[0].payload as { archived_at: string }
    expect(typeof payload.archived_at).toBe('string')
    expect(calls[0].filters).toContainEqual(['user_id', 'u1'])
  })
})
