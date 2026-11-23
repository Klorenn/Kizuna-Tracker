import { beforeEach, describe, expect, it, vi } from 'vitest'
import { presetDraft } from '@/domain/presets'

type Call = { table: string; op: string; payload?: unknown }
const calls: Call[] = []
const rpc = vi.fn()
let insertHabitResult: { data: { id: string } | null; error: { message: string } | null }
let updateError: { message: string } | null = null
// results of plain reads/deletes, keyed by "table.op"
let reads: Record<string, unknown> = {}

function chain(result: () => unknown) {
  const c: Record<string, unknown> = {}
  for (const m of ['eq', 'is', 'in', 'limit', 'select']) c[m] = () => c
  c.single = async () => result()
  c.maybeSingle = async () => result()
  c.then = (res: (v: unknown) => unknown) => res(result())
  return c
}

function builder(table: string) {
  return {
    insert: (payload: unknown) => {
      calls.push({ table, op: 'insert', payload })
      if (table === 'habits') return { select: () => ({ single: async () => insertHabitResult }) }
      return Promise.resolve({ error: null })
    },
    update: (payload: unknown) => {
      calls.push({ table, op: 'update', payload })
      return chain(() => ({ error: updateError }))
    },
    delete: () => {
      calls.push({ table, op: 'delete' })
      return chain(() => reads[`${table}.delete`] ?? { error: null })
    },
    select: () => chain(() => reads[`${table}.select`] ?? { data: null, error: null }),
  }
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  rpc,
  from: (t: string) => builder(t),
}

vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => client }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  checkIn,
  checkItem,
  createHabit,
  setHabitVisibility,
  uncheckItem,
  undoCheckIn,
  updateHabit,
} from '@/app/(app)/habitos/actions'

beforeEach(() => {
  calls.length = 0
  rpc.mockReset()
  insertHabitResult = { data: { id: 'h1' }, error: null }
  updateError = null
  reads = {}
})

describe('habit actions', () => {
  it('checkIn calls create_checkin and maps the row', async () => {
    rpc.mockResolvedValue({ data: [{ checkin_id: 'c1', created: false }], error: null })
    await expect(checkIn('h1')).resolves.toEqual({ ok: true, checkinId: 'c1', created: false })
    expect(rpc).toHaveBeenCalledWith('create_checkin', { p_habit_id: 'h1' })
  })

  it('checkIn returns a Spanish error instead of throwing', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'photo_required' } })
    await expect(checkIn('h1')).resolves.toEqual({ ok: false, error: 'Este hábito pide una foto de prueba.' })
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(checkIn('h1')).resolves.toEqual({
      ok: false,
      error: 'No pudimos guardar los cambios. Inténtalo de nuevo.',
    })
  })

  it('createHabit inserts the habit and its items by position', async () => {
    const r = await createHabit(presetDraft('eat_well'))
    expect(r).toEqual({ ok: true, id: 'h1' })
    const habit = calls.find((c) => c.table === 'habits')!.payload as Record<string, unknown>
    expect(habit).toMatchObject({ user_id: 'u1', visibility: 'friends', preset: 'eat_well', frequency_type: 'daily' })
    const items = calls.find((c) => c.table === 'habit_items')!.payload as { position: number; label: string; habit_id: string; user_id: string }[]
    expect(items.map((i) => i.position)).toEqual([0, 1, 2, 3])
    expect(items.map((i) => i.label)).toEqual(['Desayuno', 'Almuerzo', 'Once', 'Cena'])
    expect(items.every((i) => i.habit_id === 'h1' && i.user_id === 'u1')).toBe(true)
  })

  it('createHabit stores the chosen color key (presets bring their default)', async () => {
    await createHabit(presetDraft('gym'))
    expect(calls.find((c) => c.table === 'habits')!.payload).toMatchObject({ preset: 'gym', color: 'durazno' })
    calls.length = 0
    await createHabit({ ...presetDraft('gym'), color: 'rosa' })
    expect(calls.find((c) => c.table === 'habits')!.payload).toMatchObject({ color: 'rosa' })
  })

  it('createHabit refuses a color outside the palette before touching the db', async () => {
    const r = await createHabit({ ...presetDraft('read'), color: '#ff0000' as never })
    expect(r).toEqual({ ok: false, error: 'Elige un color.' })
    expect(calls).toHaveLength(0)
  })

  it('updateHabit sends the color with the rest of the habit', async () => {
    reads['habit_items.select'] = { data: [], error: null }
    await expect(updateHabit('h1', { ...presetDraft('walk'), color: 'cielo' })).resolves.toEqual({ ok: true })
    const update = calls.find((c) => c.table === 'habits' && c.op === 'update')!
    expect(update.payload).toMatchObject({ name: 'Caminar', color: 'cielo' })
  })

  it('updateHabit refuses a color outside the palette', async () => {
    await expect(updateHabit('h1', { ...presetDraft('walk'), color: 'neon' as never })).resolves.toEqual({
      ok: false,
      error: 'Elige un color.',
    })
    expect(calls).toHaveLength(0)
  })

  it('createHabit writes the log type (Leer brings reading)', async () => {
    await createHabit(presetDraft('read'))
    expect(calls.find((c) => c.table === 'habits')!.payload).toMatchObject({ preset: 'read', log_type: 'reading' })
    calls.length = 0
    await createHabit({ ...presetDraft('walk'), logType: 'none' })
    expect(calls.find((c) => c.table === 'habits')!.payload).toMatchObject({ log_type: 'none' })
  })

  it('updateHabit writes the chosen log type', async () => {
    reads['habit_items.select'] = { data: [], error: null }
    await updateHabit('h1', { ...presetDraft('walk'), logType: 'workout' })
    expect(calls.find((c) => c.table === 'habits' && c.op === 'update')!.payload).toMatchObject({ log_type: 'workout' })
  })

  it('createHabit rejects invalid drafts before touching the db', async () => {
    const r = await createHabit({ ...presetDraft('read'), name: ' ' })
    expect(r.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('createHabit(Agua) writes the quantity columns', async () => {
    await createHabit(presetDraft('water'))
    expect(calls.find((c) => c.table === 'habits')!.payload).toMatchObject({
      log_type: 'quantity',
      quantity_unit: 'ml',
      quantity_label: null,
      quantity_target: 2000,
      quantity_step: 250,
      quantity_display: 'glasses',
      glass_ml: 250,
    })
  })

  it('another log type carries no quantity columns (normalized before saving)', async () => {
    await createHabit({ ...presetDraft('water'), logType: 'none' })
    expect(calls.find((c) => c.table === 'habits')!.payload).toMatchObject({
      log_type: 'none',
      quantity_unit: null,
      quantity_target: null,
      quantity_step: null,
      quantity_label: null,
    })
  })

  it('refuses a NaN or invalid quantity goal on the server, before touching the db', async () => {
    const water = presetDraft('water')
    for (const q of [
      { ...water.quantity!, target: Number.NaN },
      { ...water.quantity!, step: Number.NaN },
      { ...water.quantity!, step: 5000 },
    ]) {
      expect((await createHabit({ ...water, quantity: q })).ok).toBe(false)
      expect((await updateHabit('h1', { ...water, quantity: q })).ok).toBe(false)
    }
    expect(calls).toHaveLength(0)
  })

  it('updateHabit saves the quantity columns', async () => {
    reads['habit_items.select'] = { data: [], error: null }
    const water = presetDraft('water')
    await updateHabit('h1', { ...water, quantity: { ...water.quantity!, target: 2500 } })
    expect(calls.find((c) => c.table === 'habits' && c.op === 'update')!.payload).toMatchObject({
      log_type: 'quantity',
      quantity_target: 2500,
    })
  })

  it('updateHabit on a quantity habit in a challenge says what can change', async () => {
    reads['habit_items.select'] = { data: [], error: null }
    reads['habits.select'] = { data: { log_type: 'quantity', visibility: 'friends' }, error: null }
    updateError = { message: 'habit_in_challenge' }
    const water = presetDraft('water')
    await expect(updateHabit('h1', { ...water, quantity: { ...water.quantity!, target: 1500 } })).resolves.toEqual({
      ok: false,
      error: 'Este hábito está en un reto: puedes subir la meta, no bajarla ni cambiar la unidad.',
    })
  })

  it('maps items_with_log, photo_conflict by context and the quantity rules', async () => {
    reads['habit_items.select'] = { data: [], error: null }
    updateError = { message: 'items_with_log' }
    await expect(updateHabit('h1', presetDraft('water'))).resolves.toEqual({
      ok: false,
      error: 'Un hábito con pasos no lleva registro detallado.',
    })
    updateError = { message: 'photo_conflict' }
    await expect(updateHabit('h1', presetDraft('water'))).resolves.toEqual({
      ok: false,
      error: 'Un hábito con foto no lleva tiempo ni cantidad.',
    })
    await expect(updateHabit('h1', presetDraft('gym'))).resolves.toEqual({
      ok: false,
      error: 'Un hábito con pasos pide la foto en cada paso, no en el hábito.',
    })
    updateError = { message: 'quantity_habit' }
    await expect(updateHabit('h1', presetDraft('water'))).resolves.toEqual({
      ok: false,
      error: 'Un hábito de cantidad no lleva foto: suma la cantidad desde Hoy.',
    })
  })

  it('undo and uncheckItem map period_closed and quantity_habit', async () => {
    reads['profiles.select'] = { data: { timezone: 'America/Santiago' }, error: null }
    reads['habit_items.select'] = { data: [], error: null }
    reads['checkins.select'] = { data: { photo_path: null }, error: null }
    reads['checkins.delete'] = { error: { message: 'period_closed' } }
    await expect(undoCheckIn('h1')).resolves.toEqual({
      ok: false,
      error: 'Este día ya cerró en un reto: no puedes deshacerlo.',
    })
    reads['checkins.delete'] = { error: { message: 'quantity_habit' } }
    await expect(undoCheckIn('h1')).resolves.toEqual({
      ok: false,
      error: 'Un hábito de cantidad se deshace quitando sumas.',
    })
    rpc.mockResolvedValue({ data: null, error: { message: 'period_closed' } })
    await expect(uncheckItem('i1')).resolves.toEqual({
      ok: false,
      error: 'Este día ya cerró en un reto: no puedes deshacerlo.',
    })
    rpc.mockResolvedValue({ data: null, error: { message: 'quantity_habit' } })
    await expect(uncheckItem('i1')).resolves.toEqual({
      ok: false,
      error: 'Un hábito de cantidad se deshace quitando sumas.',
    })
  })

  it('setHabitVisibility maps habit_in_challenge', async () => {
    updateError = { message: 'habit_in_challenge' }
    await expect(setHabitVisibility('h1', 'private')).resolves.toEqual({
      ok: false,
      error: 'Este hábito tiene un reto activo. No puede ser solo tuyo.',
    })
  })

  it('setHabitVisibility succeeds', async () => {
    await expect(setHabitVisibility('h1', 'public')).resolves.toEqual({ ok: true })
  })

  it('checkItem maps the rpc row and errors', async () => {
    rpc.mockResolvedValue({ data: [{ checkin_item_id: 'x', created: true, day_completed: true }], error: null })
    await expect(checkItem('i1')).resolves.toEqual({ ok: true, created: true, dayCompleted: true })
    expect(rpc).toHaveBeenCalledWith('check_item', { p_item_id: 'i1' })
    rpc.mockResolvedValue({ data: null, error: { message: 'item_not_found' } })
    await expect(checkItem('i1')).resolves.toEqual({ ok: false, error: 'No encontramos ese paso.' })
  })

  it('uncheckItem maps checkin_rejected', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'checkin_rejected' } })
    await expect(uncheckItem('i1')).resolves.toEqual({
      ok: false,
      error: 'Tu amigo rechazó esta prueba. No puedes deshacerla.',
    })
    rpc.mockResolvedValue({ data: null, error: null })
    await expect(uncheckItem('i1')).resolves.toEqual({ ok: true })
  })

  describe('undoCheckIn', () => {
    beforeEach(() => {
      reads['profiles.select'] = { data: { timezone: 'America/Santiago' }, error: null }
    })
    it('deletes a plain check-in', async () => {
      reads['habit_items.select'] = { data: [], error: null }
      reads['checkins.select'] = { data: { photo_path: null }, error: null }
      await expect(undoCheckIn('h1')).resolves.toEqual({ ok: true })
      expect(calls.some((c) => c.table === 'checkins' && c.op === 'delete')).toBe(true)
    })
    it('refuses habits with items', async () => {
      reads['habit_items.select'] = { data: [{ id: 'i' }], error: null }
      await expect(undoCheckIn('h1')).resolves.toEqual({ ok: false, error: 'No puedes deshacer este registro.' })
      expect(calls.some((c) => c.op === 'delete')).toBe(false)
    })
    it('refuses check-ins with a photo', async () => {
      reads['habit_items.select'] = { data: [], error: null }
      reads['checkins.select'] = { data: { photo_path: 'u/c.jpg' }, error: null }
      await expect(undoCheckIn('h1')).resolves.toEqual({ ok: false, error: 'No puedes deshacer este registro.' })
      expect(calls.some((c) => c.op === 'delete')).toBe(false)
    })
  })
})
