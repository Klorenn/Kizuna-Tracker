import { beforeEach, describe, expect, it, vi } from 'vitest'

type Result = { data?: unknown; error?: { message: string; code?: string } | null }
const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const C1 = '33333333-3333-4333-8333-333333333333'
const H1 = '44444444-4444-4444-8444-444444444444'
const H2 = '55555555-5555-4555-8555-555555555555'
const I1 = '66666666-6666-4666-8666-666666666666'
const I2 = '77777777-7777-4777-8777-777777777777'

const rpc = vi.fn()
const notify = vi.fn(async (..._a: unknown[]) => {})
const revalidatePath = vi.fn()
const createHabit = vi.fn()
let reads: Record<string, Result | (() => Result)> = {}
const read = (key: string): Result => {
  const v = reads[key] ?? { data: [], error: null }
  return typeof v === 'function' ? v() : v
}
const deletes: { table: string; filters: unknown[][] }[] = []

function chain(result: () => Result, onEq?: (args: unknown[]) => void) {
  const c: Record<string, unknown> = {}
  for (const m of ['or', 'in', 'is', 'limit', 'select', 'neq', 'order']) c[m] = () => c
  c.eq = (...a: unknown[]) => {
    onEq?.(a)
    return c
  }
  c.maybeSingle = async () => result()
  c.single = async () => result()
  c.then = (res: (v: unknown) => unknown) => res(result())
  return c
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: ME } } }) },
  rpc,
  from: (table: string) => ({
    select: () => chain(() => read(`${table}.select`)),
    delete: () => {
      const rec = { table, filters: [] as unknown[][] }
      deletes.push(rec)
      return chain(() => (reads[`${table}.delete`] as Result) ?? { data: [{ id: 'x' }], error: null }, (a) => rec.filters.push(a))
    },
  }),
}

vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => client }))
vi.mock('@/lib/notify', () => ({ notify: (...a: unknown[]) => (notify as (...x: unknown[]) => unknown)(...a) }))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('@/app/(app)/habitos/actions', () => ({ createHabit: (...a: unknown[]) => createHabit(...a) }))

import {
  acceptChallengeWithHabits,
  addChallengeItem,
  respondChallenge,
  respondChallengeItem,
  withdrawChallengeItem,
} from '@/app/(app)/retos/actions'

const revalidated = () => revalidatePath.mock.calls.map((c) => c[0])

beforeEach(() => {
  reads = {}
  deletes.length = 0
  rpc.mockReset()
  notify.mockClear()
  revalidatePath.mockClear()
  createHabit.mockReset()
})

describe('addChallengeItem', () => {
  const activeWeekly = { status: 'active', creator_id: ME, rival_id: OTHER, frequency_type: 'weekly' }

  it('rejects ids that are not uuids without touching the database', async () => {
    const r = await addChallengeItem({ challengeId: 'nope', habitId: H1, target: 3 })
    expect(r.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects a target that does not fit the challenge frequency', async () => {
    reads['challenges.select'] = { data: activeWeekly, error: null }
    const r = await addChallengeItem({ challengeId: C1, habitId: H1, target: null })
    expect(r.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('says the challenge is gone when it cannot be read', async () => {
    reads['challenges.select'] = { data: null, error: null }
    await expect(addChallengeItem({ challengeId: C1, habitId: H1, target: 3 })).resolves.toEqual({
      ok: false,
      error: 'Este reto ya no existe.',
    })
  })

  it('calls the RPC, notifies the other player when the challenge is active, and refreshes', async () => {
    reads['challenges.select'] = { data: activeWeekly, error: null }
    reads['profiles.select'] = { data: { first_name: 'Ana' }, error: null }
    reads['habits.select'] = { data: { name: 'Agua' }, error: null }
    rpc.mockResolvedValue({ data: I1, error: null })
    await expect(addChallengeItem({ challengeId: C1, habitId: H1, target: 3 })).resolves.toEqual({ ok: true, itemId: I1 })
    expect(rpc).toHaveBeenCalledWith('add_challenge_item', { p_challenge_id: C1, p_habit_id: H1, p_target_per_week: 3 })
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(
      OTHER,
      'challenge_item_proposed',
      expect.objectContaining({ challenge_id: C1, item_id: I1, from_name: 'Ana', habit_name: 'Agua', target: 3 }),
      { defer: true },
    )
    expect(revalidated()).toEqual(expect.arrayContaining(['/retos', `/retos/${C1}`]))
  })

  it('notifies the creator when the rival adds the item', async () => {
    reads['challenges.select'] = { data: { ...activeWeekly, creator_id: OTHER, rival_id: ME }, error: null }
    reads['profiles.select'] = { data: { first_name: 'Beto' }, error: null }
    reads['habits.select'] = { data: { name: 'Gym' }, error: null }
    rpc.mockResolvedValue({ data: I1, error: null })
    await addChallengeItem({ challengeId: C1, habitId: H1, target: 2 })
    expect(notify.mock.calls[0][0]).toBe(OTHER)
  })

  it('sends NO notification when the challenge is still proposed', async () => {
    reads['challenges.select'] = { data: { ...activeWeekly, status: 'proposed' }, error: null }
    rpc.mockResolvedValue({ data: I1, error: null })
    await expect(addChallengeItem({ challengeId: C1, habitId: H1, target: 3 })).resolves.toEqual({ ok: true, itemId: I1 })
    expect(notify).not.toHaveBeenCalled()
    expect(revalidated()).toEqual(expect.arrayContaining(['/retos', `/retos/${C1}`]))
  })

  it('passes a null target for a daily challenge', async () => {
    reads['challenges.select'] = { data: { ...activeWeekly, frequency_type: 'daily', status: 'proposed' }, error: null }
    rpc.mockResolvedValue({ data: I1, error: null })
    await addChallengeItem({ challengeId: C1, habitId: H1, target: null })
    expect(rpc).toHaveBeenCalledWith('add_challenge_item', { p_challenge_id: C1, p_habit_id: H1, p_target_per_week: null })
  })

  it.each([
    ['challenge_ending', 'ending'],
    ['habit_already_in_challenge', 'duplicate'],
    ['too_many_items', 'too_many'],
  ])('maps %s to code %s with Spanish copy and no notification', async (message, code) => {
    reads['challenges.select'] = { data: activeWeekly, error: null }
    rpc.mockResolvedValue({ data: null, error: { message } })
    const r = await addChallengeItem({ challengeId: C1, habitId: H1, target: 3 })
    expect(r).toMatchObject({ ok: false, code })
    expect(r.ok === false && r.error).not.toBe('No pudimos completar la acción. Inténtalo de nuevo.')
    expect(notify).not.toHaveBeenCalled()
  })

  it('keeps habit_invalid distinct from rival_habit_invalid', async () => {
    reads['challenges.select'] = { data: activeWeekly, error: null }
    rpc.mockResolvedValue({ data: null, error: { message: 'habit_invalid' } })
    const a = await addChallengeItem({ challengeId: C1, habitId: H1, target: 3 })
    rpc.mockResolvedValue({ data: null, error: { message: 'rival_habit_invalid' } })
    const b = await respondChallenge(C1, true, H1)
    expect(a.ok === false && b.ok === false && a.error !== b.error).toBe(true)
  })
})

describe('respondChallengeItem', () => {
  const proposed = { data: { proposed_by: OTHER, creator_habit_id: null, rival_habit_id: H2 }, error: null }

  it('rejects a bad item id', async () => {
    expect((await respondChallengeItem('x', true, H1)).ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('accepts, notifies the proposer with the accepted type and refreshes the returned challenge', async () => {
    reads['challenge_items.select'] = proposed
    reads['profiles.select'] = { data: { first_name: 'Beto' }, error: null }
    reads['habits.select'] = { data: { name: 'Agua' }, error: null }
    rpc.mockResolvedValue({ data: C1, error: null })
    await expect(respondChallengeItem(I1, true, H1)).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('respond_challenge_item', { p_item_id: I1, p_accept: true, p_habit_id: H1 })
    expect(notify).toHaveBeenCalledWith(
      OTHER,
      'challenge_item_accepted',
      expect.objectContaining({ challenge_id: C1, item_id: I1, from_name: 'Beto', habit_name: 'Agua' }),
      { defer: true },
    )
    expect(revalidated()).toEqual(expect.arrayContaining(['/retos', `/retos/${C1}`]))
  })

  it('declines with the declined type and no habit', async () => {
    reads['challenge_items.select'] = proposed
    reads['profiles.select'] = { data: { first_name: 'Beto' }, error: null }
    reads['habits.select'] = { data: { name: 'Agua' }, error: null }
    rpc.mockResolvedValue({ data: C1, error: null })
    await expect(respondChallengeItem(I1, false)).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('respond_challenge_item', { p_item_id: I1, p_accept: false, p_habit_id: null })
    expect(notify.mock.calls[0][1]).toBe('challenge_item_declined')
  })

  it('maps the RPC error and does not notify', async () => {
    reads['challenge_items.select'] = proposed
    rpc.mockResolvedValue({ data: null, error: { message: 'challenge_ending' } })
    const r = await respondChallengeItem(I1, true, H1)
    expect(r).toEqual({ ok: false, error: 'No queda un periodo completo para empezar este sub-reto.' })
    expect(notify).not.toHaveBeenCalled()
  })

  it('still succeeds when the item cannot be read for the notification', async () => {
    reads['challenge_items.select'] = { data: null, error: null }
    rpc.mockResolvedValue({ data: C1, error: null })
    await expect(respondChallengeItem(I1, true, H1)).resolves.toEqual({ ok: true })
    expect(notify).not.toHaveBeenCalled()
    expect(revalidated()).toContain(`/retos/${C1}`)
  })
})

describe('withdrawChallengeItem', () => {
  it('calls the RPC and refreshes the returned challenge, silently', async () => {
    rpc.mockResolvedValue({ data: C1, error: null })
    await expect(withdrawChallengeItem(I1)).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('withdraw_challenge_item', { p_item_id: I1 })
    expect(notify).not.toHaveBeenCalled()
    expect(revalidated()).toEqual(expect.arrayContaining(['/retos', `/retos/${C1}`]))
  })

  it('maps last_item', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'last_item' } })
    const r = await withdrawChallengeItem(I1)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toMatch(/al menos un sub-reto/)
  })

  it('rejects a bad id', async () => {
    expect((await withdrawChallengeItem('x')).ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('respondChallenge', () => {
  it('passes a per-item habit map as p_item_habits', async () => {
    rpc.mockResolvedValue({ error: null })
    await expect(respondChallenge(C1, true, { [I1]: H1, [I2]: H2 })).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('respond_challenge', { p_id: C1, p_accept: true, p_item_habits: { [I1]: H1, [I2]: H2 } })
  })

  it('keeps the single-habit call shape', async () => {
    rpc.mockResolvedValue({ error: null })
    await respondChallenge(C1, true, H1)
    expect(rpc).toHaveBeenCalledWith('respond_challenge', { p_id: C1, p_accept: true, p_rival_habit_id: H1 })
  })

  it('maps rival_habit_duplicate', async () => {
    rpc.mockResolvedValue({ error: { message: 'rival_habit_duplicate' } })
    const r = await respondChallenge(C1, true, { [I1]: H1, [I2]: H1 })
    expect(r.ok === false && r.error).toBe('Elige un hábito distinto para cada sub-reto.')
  })
})

describe('acceptChallengeWithHabits', () => {
  const challenge = {
    data: { id: C1, creator_id: OTHER, rival_id: ME, status: 'proposed', frequency_type: 'weekly', target_per_week: 3, requires_photo: false },
    error: null,
  }
  const items = {
    data: [
      { id: I1, position: 1, creator_habit_id: H1, target_per_week: 3, requires_photo: false, status: 'proposed' },
      { id: I2, position: 2, creator_habit_id: H2, target_per_week: 2, requires_photo: true, status: 'proposed' },
    ],
    error: null,
  }
  const habitRow = {
    data: { name: 'Agua', icon: 'drop', color: 'blue', log_type: 'none', frequency_type: 'daily', target_per_week: null, quantity_config: null, requires_photo: false },
    error: null,
  }

  it('rejects a bad challenge id and a choice key that is not an item uuid', async () => {
    expect((await acceptChallengeWithHabits('x', {})).ok).toBe(false)
    expect((await acceptChallengeWithHabits(C1, { 'bad key': 'create' })).ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('requires a choice for every proposed item before creating anything', async () => {
    reads['challenges.select'] = challenge
    reads['challenge_items.select'] = items
    const r = await acceptChallengeWithHabits(C1, { [I1]: { habitId: H2 } })
    expect(r).toEqual({ ok: false, error: 'Elige el hábito con el que vas a participar.' })
    expect(createHabit).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a challenge where the caller is not the rival', async () => {
    reads['challenges.select'] = { data: { ...challenge.data, rival_id: OTHER }, error: null }
    const r = await acceptChallengeWithHabits(C1, {})
    expect(r).toEqual({ ok: false, error: 'No puedes hacer esto en este reto.' })
  })

  it('creates habits for "create" choices and sends the whole map to respond_challenge', async () => {
    reads['challenges.select'] = challenge
    reads['challenge_items.select'] = items
    reads['habits.select'] = habitRow
    createHabit.mockResolvedValue({ ok: true, id: 'new-habit' })
    rpc.mockResolvedValue({ error: null })
    const r = await acceptChallengeWithHabits(C1, { [I1]: 'create', [I2]: { habitId: H1 } })
    expect(r).toEqual({ ok: true, habitIds: { [I1]: 'new-habit', [I2]: H1 } })
    expect(createHabit).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('respond_challenge', {
      p_id: C1,
      p_accept: true,
      p_item_habits: { [I1]: 'new-habit', [I2]: H1 },
    })
    expect(revalidated()).toEqual(expect.arrayContaining(['/retos', `/retos/${C1}`, '/']))
  })

  it('deletes only the habits it created when the RPC fails', async () => {
    reads['challenges.select'] = challenge
    reads['challenge_items.select'] = items
    reads['habits.select'] = habitRow
    createHabit.mockResolvedValue({ ok: true, id: 'new-habit' })
    rpc.mockResolvedValue({ error: { message: 'rival_habit_duplicate' } })
    const r = await acceptChallengeWithHabits(C1, { [I1]: 'create', [I2]: { habitId: H1 } })
    expect(r).toEqual({ ok: false, error: 'Elige un hábito distinto para cada sub-reto.' })
    expect(deletes).toHaveLength(1)
    expect(deletes[0].filters).toEqual(expect.arrayContaining([['id', 'new-habit'], ['user_id', ME]]))
    expect(revalidated()).toContain('/')
  })

  it('removes the habits it already created when a later creation fails', async () => {
    reads['challenges.select'] = challenge
    reads['challenge_items.select'] = items
    reads['habits.select'] = habitRow
    createHabit
      .mockResolvedValueOnce({ ok: true, id: 'h-a' })
      .mockResolvedValueOnce({ ok: false, error: 'No pudimos crear el hábito.' })
    const r = await acceptChallengeWithHabits(C1, { [I1]: 'create', [I2]: 'create' })
    expect(r).toEqual({ ok: false, error: 'No pudimos crear el hábito.' })
    expect(rpc).not.toHaveBeenCalled()
    expect(deletes).toHaveLength(1)
    expect(deletes[0].filters).toEqual(expect.arrayContaining([['id', 'h-a']]))
  })

  it('treats a lost response as success when the challenge turned active with the created habits', async () => {
    const seq = <T,>(...vals: T[]): (() => T) => {
      let n = 0
      return () => vals[Math.min(n++, vals.length - 1)]
    }
    reads['challenges.select'] = seq<Result>(challenge, { data: { status: 'active' }, error: null })
    reads['challenge_items.select'] = seq<Result>(items, {
      data: [
        { id: I1, rival_habit_id: 'new-habit', status: 'active' },
        { id: I2, rival_habit_id: H1, status: 'active' },
      ],
      error: null,
    })
    reads['habits.select'] = habitRow
    createHabit.mockResolvedValue({ ok: true, id: 'new-habit' })
    rpc.mockResolvedValue({ error: { message: 'network' } })
    const r = await acceptChallengeWithHabits(C1, { [I1]: 'create', [I2]: { habitId: H1 } })
    expect(r).toEqual({ ok: true, habitIds: { [I1]: 'new-habit', [I2]: H1 } })
    expect(deletes).toHaveLength(0)
  })
})
