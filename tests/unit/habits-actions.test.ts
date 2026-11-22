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

  it('createHabit rejects invalid drafts before touching the db', async () => {
    const r = await createHabit({ ...presetDraft('read'), name: ' ' })
    expect(r.ok).toBe(false)
    expect(calls).toHaveLength(0)
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
