import { beforeEach, describe, expect, it, vi } from 'vitest'
import { presetDraft } from '@/domain/presets'

type Call = { table: string; op: string; payload?: unknown }
const calls: Call[] = []
const rpc = vi.fn()
let insertHabitResult: { data: { id: string } | null; error: { message: string } | null }
let insertItemsError: { message: string } | null = null
let updateError: { message: string } | null = null

function builder(table: string) {
  const b: Record<string, unknown> = {}
  b.insert = (payload: unknown) => {
    calls.push({ table, op: 'insert', payload })
    if (table === 'habits') {
      return { select: () => ({ single: async () => insertHabitResult }) }
    }
    return Promise.resolve({ error: insertItemsError })
  }
  b.update = (payload: unknown) => {
    calls.push({ table, op: 'update', payload })
    const chain: Record<string, unknown> = {}
    chain.eq = () => chain
    chain.then = (res: (v: unknown) => unknown) => res({ error: updateError })
    return chain
  }
  return b
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
} from '@/app/(app)/habitos/actions'

beforeEach(() => {
  calls.length = 0
  rpc.mockReset()
  insertHabitResult = { data: { id: 'h1' }, error: null }
  insertItemsError = null
  updateError = null
})

describe('habit actions', () => {
  it('checkIn calls create_checkin and maps the row', async () => {
    rpc.mockResolvedValue({ data: [{ checkin_id: 'c1', created: false }], error: null })
    await expect(checkIn('h1')).resolves.toEqual({ checkinId: 'c1', created: false })
    expect(rpc).toHaveBeenCalledWith('create_checkin', { p_habit_id: 'h1' })
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

  it('checkItem maps the rpc row', async () => {
    rpc.mockResolvedValue({ data: [{ checkin_item_id: 'x', created: true, day_completed: true }], error: null })
    await expect(checkItem('i1')).resolves.toEqual({ created: true, dayCompleted: true })
    expect(rpc).toHaveBeenCalledWith('check_item', { p_item_id: 'i1' })
  })
})
