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
      return chain(`${table}.update`, () => reads[`${table}.update`] ?? { data: [{ id: 'x' }], error: null })
    },
    delete: () => {
      writes.push({ table, op: 'delete' })
      order.push(`${table}.delete`)
      return chain(`${table}.delete`, () => reads[`${table}.delete`] ?? { data: [{ id: 'x' }], error: null })
    },
  }),
}

vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => client }))
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => {}) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const loadFeedPage = vi.fn(async (...args: unknown[]) => (void args, { items: [], next: null }))
vi.mock('@/lib/activity-feed', () => ({ loadFeedPage: (...a: unknown[]) => loadFeedPage(...a) }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'kizuna.app', 'x-forwarded-proto': 'https' }) }))

import {
  acceptInvite,
  loadActivity,
  removeFriend,
  respondFriendRequest,
  sendFriendRequest,
} from '@/app/(app)/amigos/actions'

beforeEach(() => {
  order.length = 0
  writes.length = 0
  reads = {}
  rpc.mockReset()
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

  it('reports a request that no longer exists', async () => {
    reads['friendships.delete'] = { data: [], error: null }
    await expect(respondFriendRequest('f1', false)).resolves.toEqual({
      ok: false,
      error: 'Esta solicitud ya no existe.',
    })
  })

  it('re-reads after a unique-violation race', async () => {
    let call = 0
    reads['friendships.insert'] = { error: { message: 'dup', code: '23505' } } as never
    const orig = reads['friendships.select']
    void orig
    // first read: nothing; after the failed insert the row exists
    Object.defineProperty(reads, 'friendships.select', {
      configurable: true,
      get: () =>
        call++ === 0
          ? { data: [], error: null }
          : { data: [{ id: 'f9', requester_id: U2, addressee_id: 'me', status: 'pending' }], error: null },
    })
    await expect(sendFriendRequest(U2)).resolves.toEqual({ ok: true, status: 'accepted' })
  })

  it('declining a request deletes it', async () => {
    await expect(respondFriendRequest('f1', false)).resolves.toEqual({ ok: true })
    expect(order).toEqual(['friendships.delete'])
  })

  it('removeFriend goes through the remove_friend RPC (friendship + challenges together)', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    await expect(removeFriend(U2)).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('remove_friend', { p_other: U2 })
    expect(order).toEqual([])
  })

  it('removeFriend reports a friendship that no longer exists', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    await expect(removeFriend(U2)).resolves.toEqual({ ok: false, error: 'Esta persona ya no está en tus amigos.' })
  })
})

describe('loadActivity', () => {
  beforeEach(() => loadFeedPage.mockClear())

  it('pages with a validated cursor and filter through the user session', async () => {
    reads['profiles.select'] = { data: { timezone: 'America/Santiago' }, error: null }
    const cursor = { day: '2026-11-22', at: '2026-11-22T13:45:01.123456+00:00', id: U2 }
    await expect(loadActivity({ cursor, filter: 'photos' })).resolves.toEqual({
      ok: true,
      page: { items: [], next: null },
    })
    expect(loadFeedPage).toHaveBeenCalledWith(client, 'me', {
      timezone: 'America/Santiago',
      filter: 'photos',
      cursor,
    })
  })

  it('rejects a malformed cursor without querying', async () => {
    const r = await loadActivity({ cursor: { day: '2026-11-22', at: 'x),or(id.gt.0', id: U2 } })
    expect(r.ok).toBe(false)
    expect(loadFeedPage).not.toHaveBeenCalled()
  })

  it('unknown filters fall back to everything', async () => {
    await loadActivity({ filter: 'nope' })
    expect(loadFeedPage.mock.calls[0][2]).toMatchObject({ filter: 'all', cursor: null })
  })

  it('returns an error union when the read fails', async () => {
    loadFeedPage.mockRejectedValueOnce(new Error('boom'))
    await expect(loadActivity({})).resolves.toEqual({
      ok: false,
      error: 'No pudimos cargar la actividad. Inténtalo de nuevo.',
    })
  })
})
