import { beforeEach, describe, expect, it, vi } from 'vitest'

const U2 = '22222222-2222-4222-8222-222222222222'
const rpc = vi.fn()
const from = vi.fn()
let user: { id: string } | null = { id: 'me' }
const client = { auth: { getUser: async () => ({ data: { user }, error: null }) }, rpc, from }

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => client }))
const notifyMock = vi.fn(async (...args: unknown[]) => void args)
vi.mock('@/lib/notify', () => ({ notify: (...a: unknown[]) => notifyMock(...a) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/activity-feed', () => ({ loadFeedPage: vi.fn() }))

const {
  acceptFriendRequestFrom,
  addFriendByUsername,
  cancelFriendRequest,
  declineFriendRequest,
  loadMorePeople,
  sendFriendRequest,
} = await import('@/app/(app)/amigos/actions')
const { setDiscoverable } = await import('@/app/(app)/perfil/actions')
const { REQUEST_LIMIT_COPY } = await import('@/lib/discover-data')

function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ['eq', 'or', 'select', 'update', 'delete']) c[m] = () => c
  c.maybeSingle = async () => result
  c.then = (res: (v: unknown) => unknown) => res(result)
  return c
}

beforeEach(() => {
  user = { id: 'me' }
  rpc.mockReset()
  from.mockReset()
  notifyMock.mockClear()
})

describe('every discovery action refuses without a session before touching the database', () => {
  const calls: [string, () => Promise<unknown>][] = [
    ['loadMorePeople', () => loadMorePeople('ana', 0)],
    ['sendFriendRequest', () => sendFriendRequest(U2)],
    ['addFriendByUsername', () => addFriendByUsername('ana')],
    ['cancelFriendRequest', () => cancelFriendRequest(U2)],
    ['declineFriendRequest', () => declineFriendRequest(U2)],
    ['acceptFriendRequestFrom', () => acceptFriendRequestFrom(U2)],
    ['setDiscoverable', () => setDiscoverable(true)],
  ]
  it.each(calls)('%s', async (_name, run) => {
    user = null
    expect(await run()).toMatchObject({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })
})

describe('request_limit', () => {
  it('sendFriendRequest maps the cap to its copy', async () => {
    from.mockImplementation((table: string) => ({
      select: () =>
        table === 'public_profiles' ? chain({ data: { id: U2 }, error: null }) : chain({ data: [], error: null }),
      insert: () => chain({ error: { message: 'request_limit', code: 'P0001' } }),
    }))
    expect(await sendFriendRequest(U2)).toEqual({ ok: false, error: REQUEST_LIMIT_COPY })
  })
  it('the copy is the one the brief fixes', () => {
    expect(REQUEST_LIMIT_COPY).toBe('Tienes 20 solicitudes sin responder. Cancela alguna para enviar más.')
  })
})

describe('loadMorePeople', () => {
  it('validates on the server: a one-character query and a bad offset never reach the RPC', async () => {
    expect(await loadMorePeople('a', 20)).toMatchObject({ ok: false })
    expect(await loadMorePeople('ana', -1)).toMatchObject({ ok: false })
    expect(await loadMorePeople('ana', 1.5)).toMatchObject({ ok: false })
    expect(await loadMorePeople('ana', 'x' as unknown as number)).toMatchObject({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('returns the next page', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    expect(await loadMorePeople('ana', 20)).toEqual({ ok: true, people: [], hasMore: false })
    expect(rpc).toHaveBeenCalledWith('discover_people', { p_query: 'ana', p_limit: 21, p_offset: 20 })
  })
})

describe('cancel and decline', () => {
  it('rejects a malformed id without a round trip', async () => {
    expect(await cancelFriendRequest('nope')).toMatchObject({ ok: false })
    expect(await declineFriendRequest('nope')).toMatchObject({ ok: false })
    expect(from).not.toHaveBeenCalled()
  })
  it('reports a request that no longer exists', async () => {
    from.mockReturnValue(chain({ data: [], error: null }))
    expect(await cancelFriendRequest(U2)).toEqual({ ok: false, error: 'Esta solicitud ya no existe.' })
  })
  it('cancels a pending request', async () => {
    from.mockReturnValue(chain({ data: [{ id: 'f1' }], error: null }))
    expect(await cancelFriendRequest(U2)).toEqual({ ok: true })
  })
})

describe('acceptFriendRequestFrom', () => {
  const notify = notifyMock
  it('updates the pending row where the caller is the addressee and never inserts or notifies a new request', async () => {
    const insert = vi.fn()
    from.mockReturnValue({ ...chain({ data: [{ id: 'f1' }], error: null }), insert })
    expect(await acceptFriendRequestFrom(U2)).toEqual({ ok: true })
    expect(insert).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
  it('0 rows: the request no longer exists (the requester withdrew), nothing is created', async () => {
    const insert = vi.fn()
    from.mockReturnValue({ ...chain({ data: [], error: null }), insert })
    expect(await acceptFriendRequestFrom(U2)).toEqual({ ok: false, error: 'Esta solicitud ya no existe.' })
    expect(insert).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
  it('rejects a malformed id without a round trip', async () => {
    expect(await acceptFriendRequestFrom('nope')).toMatchObject({ ok: false })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('setDiscoverable', () => {
  it('rejects a non-boolean before the database', async () => {
    for (const v of ['true', 1, null, undefined, {}]) {
      expect(await setDiscoverable(v as unknown as boolean)).toMatchObject({ ok: false })
    }
    expect(from).not.toHaveBeenCalled()
  })
  it('writes the switch for the caller', async () => {
    from.mockReturnValue(chain({ data: [{ id: 'me' }], error: null }))
    expect(await setDiscoverable(false)).toEqual({ ok: true })
    expect(from).toHaveBeenCalledWith('profiles')
  })
  it('answers the generic retry copy when the write fails', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'boom' } }))
    expect(await setDiscoverable(true)).toEqual({ ok: false, error: 'No pudimos guardar los cambios. Inténtalo de nuevo.' })
  })
})
