import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
let user: { id: string } | null = { id: 'u1' }
const client: { rpc: unknown; auth: unknown } = { rpc, auth: { getUser: async () => ({ data: { user } }) } }
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => client }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  addTime,
  checkInWithoutTime,
  deleteTimeEntry,
  sendPomodoroBlock,
  setTimeEntry,
} from '@/app/(app)/registros/time-actions'

beforeEach(() => {
  user = { id: 'u1' }
  client.rpc = rpc
  rpc.mockReset()
})

describe('addTime', () => {
  it('adds the time through add_time and reports the total', async () => {
    rpc.mockResolvedValue({ data: [{ checkin_id: 'c1', total_minutes: 85, checkin_created: true }], error: null })
    expect(await addTime('h1', 85, 'Álgebra')).toEqual({ ok: true, totalMinutes: 85, checkedIn: true })
    expect(rpc).toHaveBeenCalledWith('add_time', { p_habit_id: 'h1', p_minutes: 85, p_topic: 'Álgebra' })
  })

  it('sends an empty topic as null', async () => {
    rpc.mockResolvedValue({ data: [{ checkin_id: 'c1', total_minutes: 30, checkin_created: false }], error: null })
    expect(await addTime('h1', 30, '  ')).toEqual({ ok: true, totalMinutes: 30, checkedIn: false })
    expect(rpc).toHaveBeenCalledWith('add_time', { p_habit_id: 'h1', p_minutes: 30, p_topic: null })
  })

  it('rejects minutes out of range without a round trip', async () => {
    for (const m of [0, -5, 1441, 1.5, Number.NaN]) {
      expect(await addTime('h1', m, null)).toEqual({ ok: false, error: 'El tiempo va de 1 minuto a 24 horas.' })
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects a topic over 60 characters without a round trip', async () => {
    expect(await addTime('h1', 10, 'x'.repeat(61))).toEqual({ ok: false, error: 'El tema tiene hasta 60 caracteres.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['minutes_over_day', 'Un día tiene 24 horas: revisa el tiempo.'],
    ['invalid_minutes', 'El tiempo va de 1 minuto a 24 horas.'],
    ['invalid_topic', 'El tema tiene hasta 60 caracteres.'],
    ['log_type_mismatch', 'Este hábito ya no lleva tiempo.'],
    ['habit_not_found', 'Este hábito ya no está activo.'],
    ['photo_required', 'Este hábito pide foto: registra el tiempo después de subirla.'],
  ])('maps %s to Spanish copy', async (code, copy) => {
    rpc.mockResolvedValue({ data: null, error: { message: code } })
    expect(await addTime('h1', 10, null)).toEqual({ ok: false, error: copy })
  })

  it('falls back to a generic message for unknown errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await addTime('h1', 10, null)).toEqual({
      ok: false,
      error: 'No pudimos guardar los cambios. Inténtalo de nuevo.',
    })
  })
})

describe('checkInWithoutTime', () => {
  it('only checks the habit in', async () => {
    rpc.mockResolvedValue({ data: [{ checkin_id: 'c1', created: true }], error: null })
    expect(await checkInWithoutTime('h1')).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('create_checkin', { p_habit_id: 'h1' })
  })

  it('maps photo_required', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'photo_required' } })
    expect(await checkInWithoutTime('h1')).toEqual({
      ok: false,
      error: 'Este hábito pide foto: registra el tiempo después de subirla.',
    })
  })
})

describe('setTimeEntry / deleteTimeEntry', () => {
  it('fixes the total of a day; an empty topic is null', async () => {
    rpc.mockResolvedValue({ data: 'e1', error: null })
    expect(await setTimeEntry('c1', 60, '')).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('set_time_entry', { p_checkin_id: 'c1', p_minutes: 60, p_topic: null })
  })

  it('validates before calling', async () => {
    expect(await setTimeEntry('c1', 2000, null)).toEqual({ ok: false, error: 'El tiempo va de 1 minuto a 24 horas.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('deletes the entry', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await deleteTimeEntry('c1')).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('delete_time_entry', { p_checkin_id: 'c1' })
  })
})

const ENDED = Date.UTC(2026, 10, 23, 15, 30, 0)

describe('sendPomodoroBlock', () => {
  it('sends the block with its id and reports a credited block', async () => {
    rpc.mockResolvedValue({
      data: [{ checkin_id: 'c1', total_minutes: 50, credited: true, checkin_created: true }],
      error: null,
    })
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25, endedAt: ENDED }, null)).toEqual({
      ok: true,
      credited: true,
      totalMinutes: 50,
    })
    expect(rpc).toHaveBeenCalledWith('add_pomodoro_block', {
      p_habit_id: 'h1',
      p_block_id: 'b1',
      p_minutes: 25,
      p_topic: null,
      p_ended_at: '2026-11-23T15:30:00.000Z',
    })
  })

  it('sends the end instant of the block as an ISO string', async () => {
    rpc.mockResolvedValue({
      data: [{ checkin_id: 'c1', total_minutes: 25, credited: true, checkin_created: true }],
      error: null,
    })
    const endedAt = Date.UTC(2026, 10, 23, 15, 30, 0)
    await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25, endedAt }, null)
    expect(rpc).toHaveBeenCalledWith('add_pomodoro_block', {
      p_habit_id: 'h1',
      p_block_id: 'b1',
      p_minutes: 25,
      p_topic: null,
      p_ended_at: '2026-11-23T15:30:00.000Z',
    })
  })

  it.each([[Number.NaN], [Number.POSITIVE_INFINITY], [8.64e15 + 1], [undefined as unknown as number]])(
    'refuses a block whose endedAt is not a valid date (%s) without calling the RPC',
    async (endedAt) => {
      rpc.mockClear()
      expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25, endedAt }, null)).toMatchObject({
        ok: false,
        retry: false,
        code: 'invalid_block',
      })
      expect(rpc).not.toHaveBeenCalled()
    },
  )

  it('treats a retry (credited false) as success', async () => {
    rpc.mockResolvedValue({
      data: [{ checkin_id: null, total_minutes: 140, credited: false, checkin_created: false }],
      error: null,
    })
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25, endedAt: ENDED }, 'Álgebra')).toEqual({
      ok: true,
      credited: false,
      totalMinutes: 140,
    })
  })

  it.each([
    ['log_type_mismatch', 'Este hábito ya no lleva tiempo.'],
    ['habit_not_found', 'Este hábito ya no está activo.'],
    ['photo_required', 'Este hábito pide foto: registra el tiempo después de subirla.'],
    ['minutes_over_day', 'Un día tiene 24 horas: revisa el tiempo.'],
    ['invalid_block', 'No pudimos guardar este bloque.'],
    ['block_expired', 'Un bloque terminó ayer y ya no se puede sumar.'],
  ])('%s is final (retry false)', async (code, copy) => {
    rpc.mockResolvedValue({ data: null, error: { message: code } })
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25, endedAt: ENDED }, null)).toEqual({
      ok: false,
      error: copy,
      retry: false,
      code,
    })
  })

  it('habit_has_items is final too', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'habit_has_items' } })
    const r = await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25, endedAt: ENDED }, null)
    expect(r).toMatchObject({ ok: false, retry: false })
  })

  it('a thrown fetch error is retryable', async () => {
    rpc.mockImplementation(() => {
      throw new TypeError('fetch failed')
    })
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25, endedAt: ENDED }, null)).toMatchObject({
      ok: false,
      retry: true,
    })
  })

  it('network and 5xx errors from the client are retryable', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: fetch failed' } })
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25, endedAt: ENDED }, null)).toMatchObject({ ok: false, retry: true })
    rpc.mockResolvedValue({ data: null, error: { message: 'Bad gateway' }, status: 502 })
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25, endedAt: ENDED }, null)).toMatchObject({ ok: false, retry: true })
  })

  it('a missing session keeps the block pending', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_authenticated' } })
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25, endedAt: ENDED }, null)).toMatchObject({ ok: false, retry: true })
  })

  it('retries what it does not recognise (deploy skew, server trouble)', async () => {
    for (const message of ['Could not find the function public.add_pomodoro_block', 'internal error']) {
      rpc.mockResolvedValue({ data: null, error: { message } })
      expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25, endedAt: ENDED }, null)).toMatchObject({ ok: false, retry: true })
    }
  })

  it('a lost session keeps the block and says to sign in', async () => {
    for (const message of ['JWT expired', 'not_authenticated']) {
      rpc.mockResolvedValue({ data: null, error: { message } })
      expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25, endedAt: ENDED }, null)).toEqual({
        ok: false,
        error: 'Inicia sesión para guardar tus bloques.',
        retry: true,
        code: 'not_authenticated',
      })
    }
  })

  it('a block id that is not a uuid can never be sent', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'invalid input syntax for type uuid: "b1"' } })
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25, endedAt: ENDED }, null)).toMatchObject({
      ok: false,
      retry: false,
      code: 'invalid_block',
    })
  })

  it('validates minutes and topic before the RPC', async () => {
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 91, endedAt: ENDED }, null)).toMatchObject({
      ok: false,
      retry: false,
      code: 'invalid_minutes',
    })
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25, endedAt: ENDED }, 'x'.repeat(61))).toMatchObject({
      ok: false,
      retry: false,
      code: 'invalid_topic',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('an empty answer without an error is retried', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25, endedAt: ENDED }, null)).toMatchObject({ ok: false, retry: true })
  })
})

describe('sendPomodoroBlock: a failed session check is not a lost session', () => {
  const block = { blockId: 'b1', minutes: 25, endedAt: ENDED }
  const CONNECT = 'No pudimos conectar. Inténtalo de nuevo en unos minutos.'
  const realAuth = client.auth

  afterEach(() => {
    client.auth = realAuth
  })

  it.each([
    ['a network failure', { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' }],
    ['a server error', { name: 'AuthApiError', status: 503, message: 'upstream down' }],
    ['an unknown error', { message: 'something odd' }],
  ])('%s keeps the block and says it could not connect', async (_name, authError) => {
    client.auth = { getUser: async () => ({ data: { user: null }, error: authError }) }
    expect(await sendPomodoroBlock('h1', block, null)).toEqual({
      ok: false,
      error: CONNECT,
      retry: true,
      code: 'session_unavailable',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('a getUser that throws says the same', async () => {
    client.auth = {
      getUser: async () => {
        throw new TypeError('fetch failed')
      },
    }
    expect(await sendPomodoroBlock('h1', block, null)).toMatchObject({ ok: false, retry: true, code: 'session_unavailable', error: CONNECT })
  })

  it.each([
    ['no session', { name: 'AuthSessionMissingError', status: 400, message: 'Auth session missing!' }],
    ['a rejected token', { name: 'AuthApiError', status: 401, message: 'invalid JWT' }],
  ])('%s still says to sign in', async (_name, authError) => {
    client.auth = { getUser: async () => ({ data: { user: null }, error: authError }) }
    expect(await sendPomodoroBlock('h1', block, null)).toMatchObject({
      ok: false,
      retry: true,
      code: 'not_authenticated',
      error: 'Inicia sesión para guardar tus bloques.',
    })
  })
})

describe('every action authenticates first', () => {
  it('answers sign-in copy without calling the RPC', async () => {
    user = null
    const signIn = { ok: false, error: 'Inicia sesión para continuar.' }
    expect(await addTime('h1', 10, null)).toEqual(signIn)
    expect(await checkInWithoutTime('h1')).toEqual(signIn)
    expect(await setTimeEntry('c1', 10, null)).toEqual(signIn)
    expect(await deleteTimeEntry('c1')).toEqual(signIn)
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 5, endedAt: ENDED }, null)).toMatchObject({
      ok: false,
      retry: true,
      code: 'not_authenticated',
    })
    expect(rpc).not.toHaveBeenCalled()
  })
})
