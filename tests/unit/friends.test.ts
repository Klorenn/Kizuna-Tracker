import { beforeEach, describe, expect, it, vi } from 'vitest'

type Result = { data?: unknown; error?: { message: string } | null }
const U2 = '22222222-2222-4222-8222-222222222222'
const order: string[] = []
const rpc = vi.fn()
let reads: Record<string, Result> = {}
const writes: { table: string; op: string; payload?: unknown }[] = []

function chain(key: string, result: () => Result) {
  const c: Record<string, unknown> = {}
  for (const m of ['eq', 'or', 'in', 'is', 'limit', 'select', 'ilike', 'neq', 'order']) c[m] = () => c
  c.maybeSingle = async () => result()
  c.single = async () => result()
  c.then = (res: (v: unknown) => unknown) => res(result())
  void key
  return c
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) },
  rpc,
  from: (table: string) => ({
    select: () => chain(`${table}.select`, () => reads[`${table}.select`] ?? { data: [], error: null }),
    insert: (payload: unknown) => {
      writes.push({ table, op: 'insert', payload })
      return chain(`${table}.insert`, () => reads[`${table}.insert`] ?? { data: { code: 'abc' }, error: null })
    },
    update: (payload: unknown) => {
      writes.push({ table, op: 'update', payload })
      order.push(`${table}.update`)
      return chain(`${table}.update`, () => reads[`${table}.update`] ?? { error: null })
    },
    delete: () => {
      writes.push({ table, op: 'delete' })
      order.push(`${table}.delete`)
      return chain(`${table}.delete`, () => ({ error: null }))
    },
  }),
}

vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => client }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'kizuna.app', 'x-forwarded-proto': 'https' }) }))
const { cancel } = vi.hoisted(() => ({ cancel: vi.fn() }))
vi.mock('@/app/(app)/retos/actions', () => ({ cancelChallengesBetween: cancel }))

import {
  acceptInvite,
  removeFriend,
  respondFriendRequest,
  sendFriendRequest,
} from '@/app/(app)/amigos/actions'

beforeEach(() => {
  order.length = 0
  writes.length = 0
  reads = {}
  rpc.mockReset()
  cancel.mockReset()
  cancel.mockImplementation(async () => {
    order.push('cancelChallengesBetween')
  })
})

describe('friend actions', () => {
  it('refuses to add yourself', async () => {
    await expect(sendFriendRequest('me')).resolves.toEqual({
      ok: false,
      error: 'No puedes agregarte a ti mismo.',
    })
  })

  it('returns the existing pending request instead of creating another', async () => {
    reads['friendships.select'] = {
      data: [{ id: 'f1', requester_id: 'me', addressee_id: U2, status: 'pending' }],
      error: null,
    }
    await expect(sendFriendRequest(U2)).resolves.toEqual({ ok: true, status: 'pending' })
    expect(writes.filter((w) => w.op === 'insert')).toHaveLength(0)
  })

  it('accepts when they already sent me a request', async () => {
    reads['friendships.select'] = {
      data: [{ id: 'f1', requester_id: U2, addressee_id: 'me', status: 'pending' }],
      error: null,
    }
    await expect(sendFriendRequest(U2)).resolves.toEqual({ ok: true, status: 'accepted' })
    expect(writes).toContainEqual({ table: 'friendships', op: 'update', payload: { status: 'accepted' } })
  })

  it('creates a pending request when none exists', async () => {
    await expect(sendFriendRequest(U2)).resolves.toEqual({ ok: true, status: 'pending' })
    expect(writes).toContainEqual({
      table: 'friendships',
      op: 'insert',
      payload: { requester_id: 'me', addressee_id: U2, status: 'pending' },
    })
  })

  it('maps an expired invite', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'invite_expired' } })
    await expect(acceptInvite('code')).resolves.toEqual({ ok: false, error: 'Esta invitación venció.' })
  })

  it('declining a request deletes it', async () => {
    await expect(respondFriendRequest('f1', false)).resolves.toEqual({ ok: true })
    expect(order).toEqual(['friendships.delete'])
  })

  it('removeFriend cancels challenges before deleting the row', async () => {
    await expect(removeFriend(U2)).resolves.toEqual({ ok: true })
    expect(cancel).toHaveBeenCalledWith('me', U2)
    expect(order).toEqual(['cancelChallengesBetween', 'friendships.delete'])
  })
})
