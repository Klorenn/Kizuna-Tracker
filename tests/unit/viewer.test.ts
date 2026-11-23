import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = {
  claims: { sub: 'u1' } as { sub?: string } | null,
  profile: { id: 'u1', timezone: 'America/Santiago', deleted_at: null } as {
    id: string
    timezone: string
    deleted_at: string | null
  } | null,
  getClaims: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  selected: [] as string[],
  eq: [] as unknown[][],
  creates: 0,
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => {
    state.creates += 1
    return {
      auth: { getClaims: state.getClaims, getUser: state.getUser },
      from: (t: string) => {
        state.from(t)
        const q = {
          select: (c: string) => {
            state.selected.push(c)
            return q
          },
          eq: (...a: unknown[]) => {
            state.eq.push(a)
            return q
          },
          maybeSingle: async () => ({ data: state.profile, error: null }),
        }
        return q
      },
    }
  },
}))

import { getViewer, loadViewer } from '@/lib/viewer'

beforeEach(() => {
  state.claims = { sub: 'u1' }
  state.profile = { id: 'u1', timezone: 'America/Santiago', deleted_at: null }
  state.selected = []
  state.eq = []
  state.creates = 0
  state.from.mockReset()
  state.getUser.mockReset().mockRejectedValue(new Error('getUser must not be called'))
  state.getClaims.mockReset().mockImplementation(async () => ({
    data: state.claims ? { claims: state.claims } : null,
    error: null,
  }))
})

describe('getViewer', () => {
  it('returns id, timezone and deletedAt for the signed-in user, from claims plus one profile read', async () => {
    const v = await getViewer()
    expect(v).toEqual({ id: 'u1', timezone: 'America/Santiago', deletedAt: null })
    expect(state.getClaims).toHaveBeenCalledTimes(1)
    expect(state.getUser).not.toHaveBeenCalled()
    expect(state.from).toHaveBeenCalledWith('profiles')
    expect(state.selected).toEqual(['id,timezone,deleted_at'])
    expect(state.eq).toEqual([['id', 'u1']])
  })

  it('carries deletedAt when the account was deleted', async () => {
    state.profile = { id: 'u1', timezone: 'UTC', deleted_at: '2026-11-01T00:00:00Z' }
    expect((await getViewer())?.deletedAt).toBe('2026-11-01T00:00:00Z')
  })

  it('returns null without a verified session', async () => {
    state.claims = null
    expect(await getViewer()).toBeNull()
    expect(state.from).not.toHaveBeenCalled()
  })

  it('returns null when claims have no subject', async () => {
    state.claims = {}
    expect(await getViewer()).toBeNull()
  })

  it('returns null when the profile row is missing', async () => {
    state.profile = null
    expect(await getViewer()).toBeNull()
  })
})

describe('loadViewer', () => {
  it('uses the supabase client it is given', async () => {
    const v = await loadViewer({
      auth: { getClaims: async () => ({ data: { claims: { sub: 'u9' } }, error: null }) },
      from: () => {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: { id: 'u9', timezone: 'UTC', deleted_at: null }, error: null }),
        }
        return q
      },
    } as never)
    expect(v).toEqual({ id: 'u9', timezone: 'UTC', deletedAt: null })
  })
})
