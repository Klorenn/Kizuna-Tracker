import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const client: { rpc: unknown } = { rpc }
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
    const r = await addTime('h1', 10, null)
    expect(r.ok).toBe(false)
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

describe('sendPomodoroBlock', () => {
  it('sends the block with its id and reports a credited block', async () => {
    rpc.mockResolvedValue({
      data: [{ checkin_id: 'c1', total_minutes: 50, credited: true, checkin_created: true }],
      error: null,
    })
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25 }, null)).toEqual({
      ok: true,
      credited: true,
      totalMinutes: 50,
    })
    expect(rpc).toHaveBeenCalledWith('add_pomodoro_block', {
      p_habit_id: 'h1',
      p_block_id: 'b1',
      p_minutes: 25,
      p_topic: null,
    })
  })

  it('treats a retry (credited false) as success', async () => {
    rpc.mockResolvedValue({
      data: [{ checkin_id: null, total_minutes: 140, credited: false, checkin_created: false }],
      error: null,
    })
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25 }, 'Álgebra')).toEqual({
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
  ])('%s is final (retry false)', async (code, copy) => {
    rpc.mockResolvedValue({ data: null, error: { message: code } })
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25 }, null)).toEqual({
      ok: false,
      error: copy,
      retry: false,
    })
  })

  it('habit_has_items is final too', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'habit_has_items' } })
    const r = await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25 }, null)
    expect(r).toMatchObject({ ok: false, retry: false })
  })

  it('a thrown fetch error is retryable', async () => {
    rpc.mockImplementation(() => {
      throw new TypeError('fetch failed')
    })
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25 }, null)).toMatchObject({
      ok: false,
      retry: true,
    })
  })

  it('network and 5xx errors from the client are retryable', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: fetch failed' } })
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25 }, null)).toMatchObject({ ok: false, retry: true })
    rpc.mockResolvedValue({ data: null, error: { message: 'Bad gateway' }, status: 502 })
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25 }, null)).toMatchObject({ ok: false, retry: true })
  })

  it('a missing session keeps the block pending', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_authenticated' } })
    expect(await sendPomodoroBlock('h1', { blockId: 'b1', minutes: 25 }, null)).toMatchObject({ ok: false, retry: true })
  })
})
