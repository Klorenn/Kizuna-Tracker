import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { checkInRpc, checkItemRpc, uncheckItemRpc } from '@/lib/tracking-rpc'

function client(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result)
  return { c: { rpc } as unknown as SupabaseClient<Database>, rpc }
}

describe('tracking-rpc', () => {
  it('checkInRpc maps the row', async () => {
    const { c, rpc } = client({ data: [{ checkin_id: 'c1', created: true }], error: null })
    await expect(checkInRpc(c, 'h1')).resolves.toEqual({ ok: true, checkinId: 'c1', created: true })
    expect(rpc).toHaveBeenCalledWith('create_checkin', { p_habit_id: 'h1' })
  })
  it('checkInRpc returns Spanish copy on errors, an empty row or a throw', async () => {
    await expect(checkInRpc(client({ data: null, error: { message: 'photo_required' } }).c, 'h1')).resolves.toEqual({
      ok: false,
      error: 'Este hábito pide una foto de prueba.',
    })
    await expect(checkInRpc(client({ data: [], error: null }).c, 'h1')).resolves.toEqual({
      ok: false,
      error: 'No pudimos guardar los cambios. Inténtalo de nuevo.',
    })
    const thrower = { rpc: () => Promise.reject(new Error('network')) } as unknown as SupabaseClient<Database>
    await expect(checkInRpc(thrower, 'h1')).resolves.toEqual({
      ok: false,
      error: 'No pudimos guardar los cambios. Inténtalo de nuevo.',
    })
  })
  it('checkItemRpc maps created and dayCompleted', async () => {
    const { c, rpc } = client({ data: [{ checkin_item_id: 'x', created: true, day_completed: true }], error: null })
    await expect(checkItemRpc(c, 'i1')).resolves.toEqual({ ok: true, created: true, dayCompleted: true })
    expect(rpc).toHaveBeenCalledWith('check_item', { p_item_id: 'i1' })
    await expect(checkItemRpc(client({ data: null, error: { message: 'item_not_found' } }).c, 'i1')).resolves.toEqual({
      ok: false,
      error: 'No encontramos ese paso.',
    })
  })
  it('uncheckItemRpc uses the undo copy', async () => {
    const { c, rpc } = client({ error: null })
    await expect(uncheckItemRpc(c, 'i1')).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('uncheck_item', { p_item_id: 'i1' })
    await expect(uncheckItemRpc(client({ error: { message: 'quantity_habit' } }).c, 'i1')).resolves.toEqual({
      ok: false,
      error: 'Un hábito de cantidad se deshace quitando sumas.',
    })
    await expect(uncheckItemRpc(client({ error: { message: 'period_closed' } }).c, 'i1')).resolves.toEqual({
      ok: false,
      error: 'Este día ya cerró en un reto: no puedes deshacerlo.',
    })
  })
})
