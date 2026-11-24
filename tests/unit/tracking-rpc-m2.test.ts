import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import {
  addPomodoroBlockRpc,
  addQuantityRpc,
  addTimeRpc,
  deleteTimeEntryRpc,
  removeQuantityRpc,
  setTimeEntryRpc,
} from '@/lib/tracking-rpc'

function client(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result)
  return { c: { rpc } as unknown as SupabaseClient<Database>, rpc }
}
const thrower = { rpc: () => Promise.reject(new Error('Failed to fetch')) } as unknown as SupabaseClient<Database>

describe('quantity wrappers', () => {
  it('addQuantityRpc sends the client entry id and maps the totals', async () => {
    const { c, rpc } = client({ data: [{ created: true, done: false, target: 2000, total: '750' }], error: null })
    await expect(addQuantityRpc(c, 'h1', 'e1', 250)).resolves.toEqual({ ok: true, total: 750, target: 2000, done: false })
    expect(rpc).toHaveBeenCalledWith('add_quantity_entry', { p_habit_id: 'h1', p_entry_id: 'e1', p_amount: 250 })
  })
  it('refuses a bad amount without a request', async () => {
    const { c, rpc } = client({ data: [], error: null })
    await expect(addQuantityRpc(c, 'h1', 'e1', 0)).resolves.toEqual({ ok: false, error: 'Revisa la cantidad.', retry: false })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('a coded refusal is final, a network failure or throw is retryable with offline copy', async () => {
    await expect(addQuantityRpc(client({ data: null, error: { message: 'amount_over_day' } }).c, 'h1', 'e1', 5)).resolves.toEqual({
      ok: false, error: 'Es demasiado para un día.', retry: false,
    })
    await expect(addQuantityRpc(client({ data: null, error: { message: 'Failed to fetch' } }).c, 'h1', 'e1', 5)).resolves.toEqual({
      ok: false, error: 'Sin conexión. Guardaremos la suma cuando vuelvas a estar en línea.', retry: true,
    })
    await expect(addQuantityRpc(thrower, 'h1', 'e1', 5)).resolves.toMatchObject({ ok: false, retry: true })
    await expect(addQuantityRpc(client({ data: [], error: null }).c, 'h1', 'e1', 5)).resolves.toEqual({
      ok: false, error: 'No pudimos guardar la cantidad. Inténtalo de nuevo.', retry: false,
    })
  })
  it('removeQuantityRpc maps totals and copy', async () => {
    const { c, rpc } = client({ data: [{ done: false, target: 10, total: 4 }], error: null })
    await expect(removeQuantityRpc(c, 'e1')).resolves.toEqual({ ok: true, total: 4, target: 10, done: false })
    expect(rpc).toHaveBeenCalledWith('remove_quantity_entry', { p_entry_id: 'e1' })
    await expect(removeQuantityRpc(client({ data: null, error: { message: 'entry_not_today' } }).c, 'e1')).resolves.toEqual({
      ok: false, error: 'Solo puedes quitar lo de hoy.',
    })
    await expect(removeQuantityRpc(thrower, 'e1')).resolves.toEqual({ ok: false, error: 'Sin conexión. No pudimos quitar la suma.' })
  })
})

describe('time wrappers', () => {
  it('addTimeRpc trims the topic, validates and maps', async () => {
    const { c, rpc } = client({ data: [{ checkin_created: true, checkin_id: 'c', total_minutes: 30 }], error: null })
    await expect(addTimeRpc(c, 'h1', 30, '  inglés ')).resolves.toEqual({ ok: true, totalMinutes: 30, checkedIn: true })
    expect(rpc).toHaveBeenCalledWith('add_time', { p_habit_id: 'h1', p_minutes: 30, p_topic: 'inglés' })
    await expect(addTimeRpc(c, 'h1', 0, null)).resolves.toEqual({ ok: false, error: 'El tiempo va de 1 minuto a 24 horas.' })
    await expect(addTimeRpc(c, 'h1', 5, 'x'.repeat(61))).resolves.toEqual({ ok: false, error: 'El tema tiene hasta 60 caracteres.' })
    await expect(addTimeRpc(client({ data: null, error: { message: 'minutes_over_day' } }).c, 'h1', 5, null)).resolves.toEqual({
      ok: false, error: 'Un día tiene 24 horas: revisa el tiempo.',
    })
    await expect(addTimeRpc(thrower, 'h1', 5, null)).resolves.toMatchObject({ ok: false })
  })
  it('setTimeEntryRpc and deleteTimeEntryRpc', async () => {
    const a = client({ data: 'c1', error: null })
    await expect(setTimeEntryRpc(a.c, 'c1', 45, null)).resolves.toEqual({ ok: true })
    expect(a.rpc).toHaveBeenCalledWith('set_time_entry', { p_checkin_id: 'c1', p_minutes: 45, p_topic: null })
    await expect(setTimeEntryRpc(a.c, 'c1', 2000, null)).resolves.toMatchObject({ ok: false })
    const d = client({ data: null, error: null })
    await expect(deleteTimeEntryRpc(d.c, 'c1')).resolves.toEqual({ ok: true })
    expect(d.rpc).toHaveBeenCalledWith('delete_time_entry', { p_checkin_id: 'c1' })
    await expect(deleteTimeEntryRpc(client({ data: null, error: { message: 'checkin_not_found' } }).c, 'c1')).resolves.toEqual({
      ok: false, error: 'Ese día no tiene check-in.',
    })
  })
})

describe('addPomodoroBlockRpc', () => {
  const block = { blockId: 'b1', minutes: 25, endedAt: Date.UTC(2026, 2, 10, 15, 0) }
  it('is idempotent by block id and sends the end instant', async () => {
    const { c, rpc } = client({ data: [{ checkin_created: false, checkin_id: 'c', credited: true, total_minutes: 25 }], error: null })
    await expect(addPomodoroBlockRpc(c, 'h1', block, null)).resolves.toEqual({ ok: true, credited: true, totalMinutes: 25 })
    expect(rpc).toHaveBeenCalledWith('add_pomodoro_block', {
      p_habit_id: 'h1', p_block_id: 'b1', p_minutes: 25, p_topic: null, p_ended_at: '2026-03-10T15:00:00.000Z',
    })
    const again = client({ data: [{ checkin_created: false, checkin_id: 'c', credited: false, total_minutes: 25 }], error: null })
    await expect(addPomodoroBlockRpc(again.c, 'h1', block, null)).resolves.toEqual({ ok: true, credited: false, totalMinutes: 25 })
  })
  it('final codes do not retry, a lost session or unknown error does', async () => {
    await expect(addPomodoroBlockRpc(client({ data: null, error: { message: 'block_expired' } }).c, 'h1', block, null)).resolves.toMatchObject({
      ok: false, retry: false, code: 'block_expired',
    })
    await expect(addPomodoroBlockRpc(client({ data: null, error: { message: 'JWT expired' } }).c, 'h1', block, null)).resolves.toMatchObject({
      ok: false, retry: true, code: 'not_authenticated',
    })
    await expect(addPomodoroBlockRpc(thrower, 'h1', block, null)).resolves.toMatchObject({ ok: false, retry: true })
  })
  it('refuses minutes out of 1-90 and a bad end without a request', async () => {
    const { c, rpc } = client({ data: [], error: null })
    await expect(addPomodoroBlockRpc(c, 'h1', { ...block, minutes: 120 }, null)).resolves.toMatchObject({ ok: false, retry: false, code: 'invalid_minutes' })
    await expect(addPomodoroBlockRpc(c, 'h1', { ...block, endedAt: NaN }, null)).resolves.toMatchObject({ ok: false, retry: false, code: 'invalid_block' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
