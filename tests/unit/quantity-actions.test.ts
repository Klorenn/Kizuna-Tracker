import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
let authAnswer: unknown
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ rpc, auth: { getUser: async () => authAnswer } }),
}))

import { addQuantity, refreshQuantity, removeQuantity } from '@/app/(app)/registros/quantity-actions'

beforeEach(() => {
  rpc.mockReset()
  revalidatePath.mockReset()
  authAnswer = { data: { user: { id: 'u1' } }, error: null }
})

describe('every action verifies the session first', () => {
  const signedOut = { data: { user: null }, error: null }
  it('addQuantity: sign-in copy, no retry, no rpc', async () => {
    authAnswer = signedOut
    await expect(addQuantity('h1', 'q1', 250)).resolves.toEqual({ ok: false, error: 'Inicia sesión para continuar.', retry: false })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('addQuantity: a failed session check keeps the tap for a retry', async () => {
    authAnswer = { data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 0 } }
    await expect(addQuantity('h1', 'q1', 250)).resolves.toMatchObject({ ok: false, retry: true })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('removeQuantity: sign-in copy, no rpc', async () => {
    authAnswer = signedOut
    await expect(removeQuantity('q1')).resolves.toEqual({ ok: false, error: 'Inicia sesión para continuar.' })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('refreshQuantity: revalidates nothing without a session', async () => {
    authAnswer = signedOut
    await refreshQuantity()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('addQuantity', () => {
  it('calls add_quantity_entry and returns the new total', async () => {
    rpc.mockResolvedValue({ data: [{ total: 1500, target: 2000, done: false, created: true }], error: null })
    await expect(addQuantity('h1', 'q1', 250)).resolves.toEqual({ ok: true, total: 1500, target: 2000, done: false })
    expect(rpc).toHaveBeenCalledWith('add_quantity_entry', { p_habit_id: 'h1', p_entry_id: 'q1', p_amount: 250 })
  })

  it('turns numeric strings into numbers', async () => {
    rpc.mockResolvedValue({ data: [{ total: '1500.00', target: '2000.00', done: true, created: true }], error: null })
    await expect(addQuantity('h1', 'q1', 250)).resolves.toEqual({ ok: true, total: 1500, target: 2000, done: true })
  })

  it('maps database errors to Spanish copy without retry', async () => {
    const cases: [string, string][] = [
      ['invalid_amount', 'Revisa la cantidad.'],
      ['amount_over_day', 'Es demasiado para un día.'],
      ['invalid_entry', 'No pudimos guardar esa suma.'],
      ['log_type_mismatch', 'Este hábito ya no es de cantidad.'],
    ]
    for (const [code, error] of cases) {
      rpc.mockResolvedValue({ data: null, error: { message: code } })
      await expect(addQuantity('h1', 'q1', 250)).resolves.toEqual({ ok: false, error, retry: false })
    }
  })

  it('marks network failures as retryable, whether the call throws or returns the error', async () => {
    rpc.mockRejectedValue(new TypeError('fetch failed'))
    await expect(addQuantity('h1', 'q1', 250)).resolves.toMatchObject({ ok: false, retry: true })
    rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: fetch failed' } })
    await expect(addQuantity('h1', 'q1', 250)).resolves.toMatchObject({ ok: false, retry: true })
  })

  it('refuses a bad amount without calling the database', async () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      await expect(addQuantity('h1', 'q1', bad)).resolves.toEqual({ ok: false, error: 'Revisa la cantidad.', retry: false })
    }
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('removeQuantity', () => {
  it('calls remove_quantity_entry and returns the new total', async () => {
    rpc.mockResolvedValue({ data: [{ total: '750.00', target: '2000.00', done: false }], error: null })
    await expect(removeQuantity('q1')).resolves.toEqual({ ok: true, total: 750, target: 2000, done: false })
    expect(rpc).toHaveBeenCalledWith('remove_quantity_entry', { p_entry_id: 'q1' })
  })

  it('maps errors to Spanish copy', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'entry_not_today' } })
    await expect(removeQuantity('q1')).resolves.toEqual({ ok: false, error: 'Solo puedes quitar lo de hoy.' })
    rpc.mockResolvedValue({ data: null, error: { message: 'log_type_mismatch' } })
    await expect(removeQuantity('q1')).resolves.toEqual({ ok: false, error: 'Este hábito ya no es de cantidad.' })
  })

  it('offline removal does not promise to save it later', async () => {
    rpc.mockRejectedValue(new TypeError('fetch failed'))
    await expect(removeQuantity('q1')).resolves.toEqual({ ok: false, error: 'Sin conexión. No pudimos quitar la suma.' })
    rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: fetch failed' } })
    await expect(removeQuantity('q1')).resolves.toEqual({ ok: false, error: 'Sin conexión. No pudimos quitar la suma.' })
  })

  it('maps entry_not_found', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'entry_not_found' } })
    await expect(removeQuantity('q1')).resolves.toEqual({ ok: false, error: 'No encontramos esa suma.' })
  })
})

describe('revalidation', () => {
  it('add and remove never revalidate (a burst of taps must not re-render Hoy each time)', async () => {
    rpc.mockResolvedValue({ data: [{ total: 250, target: 2000, done: false, created: true }], error: null })
    await addQuantity('h1', 'q1', 250)
    await removeQuantity('q1')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refreshQuantity revalidates Hoy, the habit pages and Resumen once', async () => {
    await refreshQuantity()
    expect(revalidatePath.mock.calls).toEqual([['/'], ['/habitos/[id]', 'page'], ['/resumen']])
  })
})
