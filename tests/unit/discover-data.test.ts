import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const rpc = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => ({ rpc }) }))

const { loadPeople, normalizeQuery, SHORT_QUERY_COPY } = await import('@/lib/discover-data')

const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: `id-${n}`,
  username: `user_${n}`,
  display_name: `Persona ${n}`,
  avatar_path: null,
  avatar_preset: 3,
  mutual_count: 0,
  relation: 'none',
  is_new: false,
  ...over,
})

beforeEach(() => {
  rpc.mockReset()
})

describe('normalizeQuery', () => {
  it('trims, drops one leading @ and lower-cases', () => {
    expect(normalizeQuery('  @Ana ')).toEqual({ kind: 'ok', q: 'ana' })
  })
  it('treats empty, blank, a lone @ and non-strings as no query', () => {
    for (const v of ['', '   ', '@', null, undefined, 42]) expect(normalizeQuery(v)).toEqual({ kind: 'none' })
  })
  it('refuses one character and more than 40', () => {
    expect(normalizeQuery('a')).toEqual({ kind: 'short' })
    expect(normalizeQuery('@a')).toEqual({ kind: 'short' })
    expect(normalizeQuery('x'.repeat(41))).toEqual({ kind: 'long' })
    expect(normalizeQuery('x'.repeat(40))).toEqual({ kind: 'ok', q: 'x'.repeat(40) })
  })
})

describe('loadPeople', () => {
  it('asks for limit + 1 rows and reports hasMore from the 21st', async () => {
    rpc.mockResolvedValue({ data: Array.from({ length: 21 }, (_, i) => row(i)), error: null })
    const r = await loadPeople({ query: null, offset: 0, limit: 20 })
    expect(rpc).toHaveBeenCalledWith('discover_people', { p_limit: 21, p_offset: 0 })
    if (!r.ok) throw new Error('expected ok')
    expect(r.people).toHaveLength(20)
    expect(r.hasMore).toBe(true)
  })

  it('has no more when the page is not over-full', async () => {
    rpc.mockResolvedValue({ data: Array.from({ length: 20 }, (_, i) => row(i)), error: null })
    const r = await loadPeople({ query: null, offset: 20, limit: 20 })
    expect(r).toMatchObject({ ok: true, hasMore: false })
  })

  it('maps the rows to camel case and never carries the raw avatar path', async () => {
    rpc.mockResolvedValue({ data: [row(1, { mutual_count: 2, relation: 'incoming', is_new: true })], error: null })
    const r = await loadPeople({ query: null, offset: 0, limit: 3 })
    if (!r.ok) throw new Error('expected ok')
    expect(r.people[0]).toEqual({
      id: 'id-1',
      username: 'user_1',
      displayName: 'Persona 1',
      avatarSrc: null,
      avatarPreset: 3,
      mutualCount: 2,
      relation: 'incoming',
      isNew: true,
    })
  })

  it('returns the error state, never an empty list, when the RPC fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const r = await loadPeople({ query: null, offset: 0, limit: 20 })
    expect(r.ok).toBe(false)
  })

  it('returns the error state when the call throws', async () => {
    rpc.mockImplementation(async () => {
      throw new Error('network')
    })
    expect((await loadPeople({ query: null, offset: 0, limit: 20 })).ok).toBe(false)
  })

  it('sends the normalised query', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await loadPeople({ query: '  @Ana ', offset: 0, limit: 20 })
    expect(rpc).toHaveBeenCalledWith('discover_people', { p_query: 'ana', p_limit: 21, p_offset: 0 })
  })

  it('refuses a one-character query without calling the RPC', async () => {
    expect(await loadPeople({ query: 'a', offset: 0, limit: 20 })).toEqual({ ok: false, error: SHORT_QUERY_COPY })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps invalid_query from the database', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'invalid_query' } })
    expect(await loadPeople({ query: 'ab', offset: 0, limit: 20 })).toEqual({ ok: false, error: SHORT_QUERY_COPY })
  })
})
