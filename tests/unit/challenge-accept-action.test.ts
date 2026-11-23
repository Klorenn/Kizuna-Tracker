import { beforeEach, describe, expect, it, vi } from 'vitest'

type Result = { data?: unknown; error?: { message: string; code?: string } | null }
const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const CH = '33333333-3333-4333-8333-333333333333'
const SRC_HABIT = '44444444-4444-4444-8444-444444444444'
const NEW_HABIT = '55555555-5555-4555-8555-555555555555'

let reads: Record<string, Result> = {}
let log: string[] = []
const rpc = vi.fn()
const createHabit = vi.fn()
let signedIn = true
let usedServiceRole = false

function chain(key: string) {
  const c: Record<string, unknown> = {}
  for (const m of ['eq', 'or', 'in', 'is', 'limit', 'select', 'neq', 'order']) c[m] = () => c
  const result = () => reads[key] ?? { data: [], error: null }
  c.maybeSingle = async () => result()
  c.single = async () => result()
  c.then = (res: (v: unknown) => unknown) => res(result())
  return c
}
const client = {
  rpc,
  from: (table: string) => ({
    select: () => {
      log.push(`${table}.select`)
      return chain(`${table}.select`)
    },
    delete: () => {
      log.push(`${table}.delete`)
      return chain(`${table}.delete`)
    },
    insert: () => {
      log.push(`${table}.insert`)
      return chain(`${table}.insert`)
    },
    update: () => {
      log.push(`${table}.update`)
      return chain(`${table}.update`)
    },
  }),
}

vi.mock('@/lib/require-user', () => ({
  requireUser: async () => {
    log.push('requireUser')
    return signedIn
      ? { ok: true, supabase: client, userId: ME }
      : { ok: false, error: 'Inicia sesión para continuar.', unavailable: false }
  },
}))
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => client }))
vi.mock('@/lib/supabase/admin', () => {
  usedServiceRole = true
  return { createAdminClient: () => client }
})
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => {}) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/app/(app)/habitos/actions', () => ({ createHabit: (...a: unknown[]) => createHabit(...a) }))

import { acceptChallengeWithNewHabit } from '@/app/(app)/retos/actions'

const challenge = (over: Record<string, unknown> = {}) => ({
  id: CH,
  creator_id: OTHER,
  rival_id: ME,
  creator_habit_id: SRC_HABIT,
  status: 'proposed',
  frequency_type: 'weekly',
  target_per_week: 3,
  requires_photo: false,
  ...over,
})
const sourceRow = (over: Record<string, unknown> = {}) => ({
  name: 'Valorant',
  icon: 'target',
  color: 'rosa',
  log_type: 'none',
  quantity_unit: null,
  quantity_label: null,
  quantity_target: null,
  quantity_step: null,
  quantity_display: 'base',
  glass_ml: 250,
  ...over,
})

beforeEach(() => {
  reads = {
    'challenges.select': { data: challenge(), error: null },
    'habits.select': { data: sourceRow(), error: null },
    'habits.delete': { data: [{ id: NEW_HABIT }], error: null },
  }
  log = []
  signedIn = true
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null })
  createHabit.mockReset()
  createHabit.mockResolvedValue({ ok: true, id: NEW_HABIT })
})

describe('acceptChallengeWithNewHabit', () => {
  it('refuses without a session before any read', async () => {
    signedIn = false
    await expect(acceptChallengeWithNewHabit(CH)).resolves.toEqual({ ok: false, error: 'Inicia sesión para continuar.' })
    expect(log).toEqual(['requireUser'])
    expect(createHabit).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a malformed id before any read', async () => {
    const r = await acceptChallengeWithNewHabit('nope')
    expect(r.ok).toBe(false)
    expect(log).toEqual(['requireUser'])
    expect(createHabit).not.toHaveBeenCalled()
  })

  it('refuses a caller who is not the rival, creating nothing and never reading the habit', async () => {
    reads['challenges.select'] = { data: challenge({ rival_id: OTHER, creator_id: ME }), error: null }
    await expect(acceptChallengeWithNewHabit(CH)).resolves.toEqual({
      ok: false,
      error: 'No puedes hacer esto en este reto.',
    })
    expect(log).not.toContain('habits.select')
    expect(createHabit).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(['active', 'cancelled', 'finished', 'declined'])('refuses a challenge that is %s, creating nothing', async (status) => {
    reads['challenges.select'] = { data: challenge({ status }), error: null }
    await expect(acceptChallengeWithNewHabit(CH)).resolves.toEqual({ ok: false, error: 'Este reto ya fue respondido.' })
    expect(log).not.toContain('habits.select')
    expect(createHabit).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('says the challenge no longer exists when the row is not visible', async () => {
    reads['challenges.select'] = { data: null, error: null }
    await expect(acceptChallengeWithNewHabit(CH)).resolves.toEqual({ ok: false, error: 'Este reto ya no existe.' })
    expect(createHabit).not.toHaveBeenCalled()
  })

  it('refuses when the proposer habit is not readable, creating nothing', async () => {
    reads['habits.select'] = { data: null, error: null }
    await expect(acceptChallengeWithNewHabit(CH)).resolves.toEqual({
      ok: false,
      error: 'El hábito de este reto ya no está disponible.',
    })
    expect(createHabit).not.toHaveBeenCalled()
  })

  it('happy path: creates one habit from the challenge and accepts with its id', async () => {
    reads['challenges.select'] = { data: challenge({ frequency_type: 'weekly', target_per_week: 3, requires_photo: true }), error: null }
    const r = await acceptChallengeWithNewHabit(CH)
    expect(r).toEqual({ ok: true, habitId: NEW_HABIT })
    expect(createHabit).toHaveBeenCalledTimes(1)
    expect(createHabit.mock.calls[0][0]).toMatchObject({
      name: 'Valorant',
      icon: 'target',
      color: 'rosa',
      logType: 'none',
      frequency: { type: 'weekly', target: 3 },
      requiresPhoto: true,
      visibility: 'friends',
      items: [],
      preset: null,
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('respond_challenge', { p_id: CH, p_accept: true, p_rival_habit_id: NEW_HABIT })
    expect(log).not.toContain('habits.delete')
  })

  it('reads with the caller session only (never the service role)', async () => {
    await acceptChallengeWithNewHabit(CH)
    expect(usedServiceRole).toBe(false)
  })

  it('falls back to "Solo marcar" when the log type cannot be used', async () => {
    reads['habits.select'] = { data: sourceRow({ log_type: 'time' }), error: null }
    reads['challenges.select'] = { data: challenge({ requires_photo: true }), error: null }
    await acceptChallengeWithNewHabit(CH)
    expect(createHabit.mock.calls[0][0]).toMatchObject({ logType: 'none', requiresPhoto: true })
  })

  it('returns the creation error and does not accept when the habit cannot be created', async () => {
    createHabit.mockResolvedValue({ ok: false, error: 'Ponle un nombre al hábito.' })
    await expect(acceptChallengeWithNewHabit(CH)).resolves.toEqual({ ok: false, error: 'Ponle un nombre al hábito.' })
    expect(rpc).not.toHaveBeenCalled()
    expect(log).not.toContain('habits.delete')
  })

  it('respond_challenge failure: removes the new habit and returns the mapped error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'challenge_not_proposed' } })
    await expect(acceptChallengeWithNewHabit(CH)).resolves.toEqual({ ok: false, error: 'Este reto ya fue respondido.' })
    expect(log.filter((l) => l === 'habits.delete')).toHaveLength(1)
  })

  it('maps a friendship that ended', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_friends' } })
    await expect(acceptChallengeWithNewHabit(CH)).resolves.toEqual({ ok: false, error: 'Solo puedes retar a tus amigos.' })
    expect(log).toContain('habits.delete')
  })

  it('clean-up failure (error): says the habit was created', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'challenge_not_proposed' } })
    reads['habits.delete'] = { data: null, error: { message: 'boom' } }
    await expect(acceptChallengeWithNewHabit(CH)).resolves.toEqual({
      ok: false,
      error: 'El reto ya no está disponible. Creamos «Valorant» en tus hábitos; puedes archivarlo.',
    })
  })

  it('clean-up failure (no row removed): says the habit was created', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'challenge_not_proposed' } })
    reads['habits.delete'] = { data: [], error: null }
    const r = await acceptChallengeWithNewHabit(CH)
    expect(r).toEqual({
      ok: false,
      error: 'El reto ya no está disponible. Creamos «Valorant» en tus hábitos; puedes archivarlo.',
    })
  })

  it('a second call after a successful accept creates nothing', async () => {
    await expect(acceptChallengeWithNewHabit(CH)).resolves.toMatchObject({ ok: true })
    createHabit.mockClear()
    reads['challenges.select'] = { data: challenge({ status: 'active' }), error: null }
    await expect(acceptChallengeWithNewHabit(CH)).resolves.toEqual({ ok: false, error: 'Este reto ya fue respondido.' })
    expect(createHabit).not.toHaveBeenCalled()
  })
})
