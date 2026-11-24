import { beforeEach, describe, expect, it, vi } from 'vitest'

type Result = { data?: unknown; error?: { message: string; code?: string } | null }
const U2 = '22222222-2222-4222-8222-222222222222'
const H1 = '33333333-3333-4333-8333-333333333333'
const rpc = vi.fn()
let reads: Record<string, Result> = {}
const writes: { table: string; op: string; payload?: unknown }[] = []

function chain(result: () => Result) {
  const c: Record<string, unknown> = {}
  for (const m of ['eq', 'or', 'in', 'is', 'limit', 'select', 'neq', 'order']) c[m] = () => c
  c.maybeSingle = async () => result()
  c.single = async () => result()
  c.then = (res: (v: unknown) => unknown) => res(result())
  return c
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) },
  rpc,
  from: (table: string) => ({
    select: () => chain(() => reads[`${table}.select`] ?? { data: [], error: null }),
    insert: (payload: unknown) => {
      writes.push({ table, op: 'insert', payload })
      return chain(() => reads[`${table}.insert`] ?? { data: { id: 'c1' }, error: null })
    },
  }),
}

vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => client }))
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => {}) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  proposeChallenge,
  rejectCheckin,
  requestCancel,
  respondChallenge,
} from '@/app/(app)/retos/actions'

const input = {
  rivalId: U2,
  habitId: H1,
  frequency: { type: 'weekly', target: 4 } as const,
  weeks: 4,
  fineAmount: 4500,
}

beforeEach(() => {
  reads = {}
  writes.length = 0
  rpc.mockReset()
})

describe('proposeChallenge', () => {
  it('refuses a private habit', async () => {
    reads['friendships.select'] = { data: [{ id: 'f1' }], error: null }
    reads['habits.select'] = { data: { visibility: 'private', requires_photo: false, archived_at: null }, error: null }
    reads['profiles.select'] = { data: { timezone: 'America/Santiago' }, error: null }
    await expect(proposeChallenge(input)).resolves.toEqual({
      ok: false,
      error: 'Este hábito es solo para ti. Cámbialo a Amigos o Público para retar.',
    })
    expect(writes).toHaveLength(0)
  })

  it('refuses a rival who is not a friend', async () => {
    reads['friendships.select'] = { data: [], error: null }
    reads['habits.select'] = { data: { visibility: 'friends', requires_photo: false, archived_at: null }, error: null }
    reads['profiles.select'] = { data: { timezone: 'America/Santiago' }, error: null }
    await expect(proposeChallenge(input)).resolves.toEqual({
      ok: false,
      error: 'Solo puedes retar a tus amigos.',
    })
  })

  it('inherits requires_photo and timezone, and returns the id', async () => {
    reads['friendships.select'] = { data: [{ id: 'f1' }], error: null }
    reads['habits.select'] = { data: { visibility: 'friends', requires_photo: true, archived_at: null }, error: null }
    reads['profiles.select'] = { data: { timezone: 'America/Santiago' }, error: null }
    await expect(proposeChallenge(input)).resolves.toEqual({ ok: true, id: 'c1' })
    expect(writes[0]).toEqual({
      table: 'challenges',
      op: 'insert',
      payload: {
        creator_id: 'me',
        rival_id: U2,
        creator_habit_id: H1,
        frequency_type: 'weekly',
        target_per_week: 4,
        requires_photo: true,
        weeks: 4,
        fine_amount: 4500,
        timezone: 'America/Santiago',
      },
    })
  })

  it('returns a typed "exists" result with the challenge id when one is already open with that person', async () => {
    reads['friendships.select'] = { data: [{ id: 'f1' }], error: null }
    reads['challenges.select'] = { data: [{ id: 'c-open' }], error: null }
    reads['habits.select'] = { data: { visibility: 'friends', requires_photo: false, archived_at: null }, error: null }
    reads['profiles.select'] = { data: { timezone: 'America/Santiago' }, error: null }
    await expect(proposeChallenge(input)).resolves.toEqual({
      ok: false,
      code: 'exists',
      existingId: 'c-open',
      error: 'Ya tienes un reto con esta persona.',
    })
    expect(writes).toHaveLength(0)
  })

  it('maps a DB-level duplicate (23505) to the same typed result instead of a generic failure', async () => {
    reads['friendships.select'] = { data: [{ id: 'f1' }], error: null }
    reads['habits.select'] = { data: { visibility: 'friends', requires_photo: false, archived_at: null }, error: null }
    reads['profiles.select'] = { data: { timezone: 'America/Santiago' }, error: null }
    reads['challenges.insert'] = { data: null, error: { message: 'duplicate key', code: '23505' } }
    const r = await proposeChallenge(input)
    expect(r).toMatchObject({ ok: false, code: 'exists' })
  })

  it('rejects ids that are not UUIDs', async () => {
    const r = await proposeChallenge({ ...input, rivalId: 'abc,or(x)' })
    expect(r.ok).toBe(false)
    expect(writes).toHaveLength(0)
  })

  it('validates the input first', async () => {
    const r = await proposeChallenge({ ...input, fineAmount: 0 })
    expect(r.ok).toBe(false)
    expect(writes).toHaveLength(0)
  })
})

describe('respondChallenge', () => {
  it('maps a missing rival habit', async () => {
    rpc.mockResolvedValue({ error: { message: 'rival_habit_required' } })
    const r = await respondChallenge('c1', true)
    expect(r.ok).toBe(false)
  })

  it('passes the arguments to the RPC', async () => {
    rpc.mockResolvedValue({ error: null })
    await expect(respondChallenge('c1', true, H1)).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('respond_challenge', {
      p_id: 'c1',
      p_accept: true,
      p_rival_habit_id: H1,
    })
  })
})

describe('requestCancel', () => {
  it('reports a pending cancel request', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    await expect(requestCancel('c1')).resolves.toEqual({ ok: true, cancelled: false })
  })

  it('reports a cancelled challenge', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    await expect(requestCancel('c1')).resolves.toEqual({ ok: true, cancelled: true })
  })
})

describe('rejectCheckin', () => {
  it('maps the closed window', async () => {
    rpc.mockResolvedValue({ error: { message: 'reject_window_closed' } })
    await expect(rejectCheckin('k1', 'unclear')).resolves.toEqual({
      ok: false,
      error: 'Pasaron más de 24 horas. Ya no puedes rechazar esta foto.',
    })
  })

  it('rejects an unknown reason without calling the RPC', async () => {
    const r = await rejectCheckin('k1', 'whatever' as never)
    expect(r.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('succeeds', async () => {
    rpc.mockResolvedValue({ error: null })
    await expect(rejectCheckin('k1', 'duplicate')).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('reject_checkin', { p_checkin_id: 'k1', p_reason: 'duplicate' })
  })
})
