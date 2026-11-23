import { beforeEach, describe, expect, it, vi } from 'vitest'

type Call = { table: string; op: string; cols?: string; filters: [string, unknown][]; order?: unknown; limit?: number }
const calls: Call[] = []
const rpc = vi.fn()
let selectResult: unknown = { data: null, error: null }

function chain(call: Call) {
  const c: Record<string, unknown> = {}
  c.eq = (col: string, v: unknown) => (call.filters.push([col, v]), c)
  c.order = (col: string, o: unknown) => ((call.order = [col, o]), c)
  c.limit = (n: number) => ((call.limit = n), c)
  c.maybeSingle = async () => selectResult
  c.then = (res: (v: unknown) => unknown) => res(selectResult)
  return c
}

const client = {
  rpc,
  from: (table: string) => ({
    select: (cols: string) => {
      const call: Call = { table, op: 'select', cols, filters: [] }
      calls.push(call)
      return chain(call)
    },
  }),
}

vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => client }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  addCardio,
  checkInWithCardio,
  deleteCardio,
  lastCardio,
  updateCardio,
} from '@/app/(app)/registros/cardio-actions'

const run = { kind: 'run' as const, distanceM: 5200, durationS: 1780, effort: 3, note: null }
const rpcArgs = {
  p_checkin_id: 'c1',
  p_kind: 'run',
  p_distance_m: 5200,
  p_duration_s: 1780,
  p_effort: 3,
  p_note: null,
}

beforeEach(() => {
  calls.length = 0
  rpc.mockReset()
  selectResult = { data: null, error: null }
})

describe('checkInWithCardio', () => {
  it('checks in, then adds the outing to that check-in', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'create_checkin' ? { data: [{ checkin_id: 'c1', created: true }], error: null } : { data: 'e1', error: null },
    )
    expect(await checkInWithCardio('h1', run)).toEqual({ ok: true, checkinId: 'c1', created: true })
    expect(rpc.mock.calls).toEqual([
      ['create_checkin', { p_habit_id: 'h1' }],
      ['add_cardio_entry', rpcArgs],
    ])
  })

  it('Solo marcar only checks in', async () => {
    rpc.mockResolvedValue({ data: [{ checkin_id: 'c1', created: false }], error: null })
    expect(await checkInWithCardio('h1', null)).toEqual({ ok: true, checkinId: 'c1', created: false })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('answers without any rpc when the distance or the time is missing', async () => {
    expect(await checkInWithCardio('h1', { ...run, distanceM: 0 })).toEqual({
      ok: false,
      checkedIn: false,
      error: 'Escribe la distancia.',
    })
    expect(await checkInWithCardio('h1', { ...run, durationS: 0 })).toEqual({
      ok: false,
      checkedIn: false,
      error: 'Escribe el tiempo.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('keeps the habit checked in when the outing fails', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'create_checkin'
        ? { data: [{ checkin_id: 'c1', created: true }], error: null }
        : { data: null, error: { message: 'too_many_entries' } },
    )
    expect(await checkInWithCardio('h1', run)).toEqual({
      ok: false,
      checkedIn: true,
      error: 'Puedes registrar hasta 10 salidas por día.',
    })
  })

  it('maps a failed check-in', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'habit_not_found' } })
    expect(await checkInWithCardio('h1', run)).toEqual({
      ok: false,
      checkedIn: false,
      error: 'No encontramos ese hábito.',
    })
  })
})

describe('addCardio', () => {
  it('returns the new id', async () => {
    rpc.mockResolvedValue({ data: 'e1', error: null })
    expect(await addCardio('c1', run)).toEqual({ ok: true, id: 'e1' })
    expect(rpc).toHaveBeenCalledWith('add_cardio_entry', rpcArgs)
  })

  it('trims the note and sends an empty one as null', async () => {
    rpc.mockResolvedValue({ data: 'e1', error: null })
    await addCardio('c1', { ...run, note: '  Parque  ' })
    expect(rpc).toHaveBeenLastCalledWith('add_cardio_entry', { ...rpcArgs, p_note: 'Parque' })
    await addCardio('c1', { ...run, note: '   ' })
    expect(rpc).toHaveBeenLastCalledWith('add_cardio_entry', { ...rpcArgs, p_note: null })
  })

  it.each([
    ['too_many_entries', 'Puedes registrar hasta 10 salidas por día.'],
    ['invalid_cardio', 'Revisa la distancia y el tiempo.'],
    ['entry_not_found', 'No encontramos esa salida.'],
    ['checkin_not_found', 'Ese día no tiene check-in.'],
    ['log_type_mismatch', 'Este hábito no lleva ese tipo de registro.'],
  ])('maps %s', async (code, copy) => {
    rpc.mockResolvedValue({ data: null, error: { message: code } })
    expect(await addCardio('c1', run)).toEqual({ ok: false, error: copy })
  })

  it('rejects an out-of-range effort or a long note before the rpc', async () => {
    expect((await addCardio('c1', { ...run, effort: 6 })).ok).toBe(false)
    expect((await addCardio('c1', { ...run, note: 'x'.repeat(61) })).ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('updateCardio / deleteCardio', () => {
  it('updates by entry id', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await updateCardio('e1', { ...run, distanceM: 5000 })).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('update_cardio_entry', {
      p_entry_id: 'e1',
      p_kind: 'run',
      p_distance_m: 5000,
      p_duration_s: 1780,
      p_effort: 3,
      p_note: null,
    })
  })

  it('maps entry_not_found on update', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'entry_not_found' } })
    expect(await updateCardio('e1', run)).toEqual({ ok: false, error: 'No encontramos esa salida.' })
  })

  it('deletes by entry id', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await deleteCardio('e1')).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('delete_cardio_entry', { p_entry_id: 'e1' })
  })

  it('maps an unknown failure to the generic copy', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await deleteCardio('e1')).toEqual({ ok: false, error: 'No pudimos guardar los cambios. Inténtalo de nuevo.' })
  })
})

describe('lastCardio', () => {
  it('reads the most recent outing of the habit', async () => {
    selectResult = {
      data: { kind: 'run', distance_m: 5200, duration_s: 1780, effort: 3, note: null },
      error: null,
    }
    expect(await lastCardio('h1')).toEqual(run)
    expect(calls[0]).toMatchObject({
      table: 'cardio_entries',
      filters: [['habit_id', 'h1']],
      order: ['created_at', { ascending: false }],
      limit: 1,
    })
  })

  it('is null without outings', async () => {
    expect(await lastCardio('h1')).toBeNull()
  })
})

describe('updateCardio validation and errors', () => {
  it.each([
    ['no distance', { ...run, distanceM: 0 }, 'Escribe la distancia.'],
    ['no time', { ...run, durationS: 0 }, 'Escribe el tiempo.'],
    ['distance above 500 km', { ...run, distanceM: 500001 }, 'La distancia va hasta 500 km.'],
    ['time above 24 h', { ...run, durationS: 86401 }, 'El tiempo va hasta 24 horas.'],
    ['a fractional distance', { ...run, distanceM: 5200.5 }, 'La distancia debe ser un número entero de metros.'],
    ['a fractional time', { ...run, durationS: 1780.5 }, 'El tiempo debe ser un número entero de segundos.'],
    ['effort out of range', { ...run, effort: 0 }, 'Revisa la distancia y el tiempo.'],
    ['a fractional effort', { ...run, effort: 2.5 }, 'Revisa la distancia y el tiempo.'],
  ])('refuses %s before any rpc', async (_name, entry, error) => {
    expect(await updateCardio('e1', entry)).toEqual({ ok: false, error })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('names the note limit', async () => {
    expect(await updateCardio('e1', { ...run, note: 'x'.repeat(61) })).toEqual({
      ok: false,
      error: 'La nota puede tener hasta 60 caracteres.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('accepts a note of exactly 60 characters', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await updateCardio('e1', { ...run, note: 'x'.repeat(60) })).toEqual({ ok: true })
  })

  it('maps not_authenticated on update', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_authenticated' } })
    expect(await updateCardio('e1', run)).toEqual({ ok: false, error: 'Inicia sesión para continuar.' })
  })
})

describe('not_authenticated on the other writes', () => {
  it.each([
    ['addCardio', () => addCardio('c1', run)],
    ['deleteCardio', () => deleteCardio('e1')],
  ])('%s asks to sign in', async (_name, call) => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_authenticated' } })
    expect(await call()).toEqual({ ok: false, error: 'Inicia sesión para continuar.' })
  })

  it('checkInWithCardio asks to sign in and reports no check-in', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_authenticated' } })
    expect(await checkInWithCardio('h1', run)).toEqual({
      ok: false,
      checkedIn: false,
      error: 'Inicia sesión para continuar.',
    })
  })
})
