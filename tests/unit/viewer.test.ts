import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const state = {
  claims: { sub: 'u1', email: 'a@b.cl' } as { sub?: string; email?: string } | null,
  claimsThrows: null as unknown,
  profile: null as Row | null,
  profileError: null as { message: string } | null,
  getClaims: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  selected: [] as string[],
  eq: [] as unknown[][],
}
const row = (over: Row = {}): Row => ({
  id: 'u1',
  timezone: 'America/Santiago',
  deleted_at: null,
  username: 'carol',
  first_name: 'Carolina',
  last_name: 'E2E',
  avatar_path: null,
  avatar_updated_at: null,
  avatar_preset: 3,
  timezone_changed_at: null,
  reminder_time: '21:00:00',
  ...over,
})

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
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
        maybeSingle: async () => ({ data: state.profile, error: state.profileError }),
      }
      return q
    },
  }),
}))

import {
  getSessionUser,
  getViewer,
  getViewerProfile,
  viewerMissingDestination,
} from '@/lib/viewer'

beforeEach(() => {
  state.claims = { sub: 'u1', email: 'a@b.cl' }
  state.claimsThrows = null
  state.profile = row()
  state.profileError = null
  state.selected = []
  state.eq = []
  state.from.mockReset()
  state.getUser.mockReset().mockRejectedValue(new Error('getUser must not be called'))
  state.getClaims.mockReset().mockImplementation(async () => {
    if (state.claimsThrows) throw state.claimsThrows
    return { data: state.claims ? { claims: state.claims } : null, error: null }
  })
})

describe('getViewer', () => {
  it('returns id, timezone and deletedAt from one claims read and one profile read', async () => {
    expect(await getViewer()).toEqual({ id: 'u1', timezone: 'America/Santiago', deletedAt: null })
    expect(state.getClaims).toHaveBeenCalledTimes(1)
    expect(state.getUser).not.toHaveBeenCalled()
    expect(state.from).toHaveBeenCalledTimes(1)
    expect(state.from).toHaveBeenCalledWith('profiles')
    expect(state.eq).toEqual([['id', 'u1']])
    expect(state.selected[0]).toContain('id,timezone,deleted_at')
  })

  it('carries deletedAt when the account was deleted', async () => {
    state.profile = row({ deleted_at: '2026-11-01T00:00:00Z' })
    expect((await getViewer())?.deletedAt).toBe('2026-11-01T00:00:00Z')
  })

  it('returns null without a verified session, and reads no profile', async () => {
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

  it('throws when the profile query fails, so a DB blip is not read as signed out', async () => {
    state.profile = null
    state.profileError = { message: 'timeout' }
    await expect(getViewer()).rejects.toThrow(/timeout/)
  })
})

describe('getViewerProfile', () => {
  it('maps the extra columns the adopted pages need, in the same single read', async () => {
    expect(await getViewerProfile()).toMatchObject({
      id: 'u1',
      username: 'carol',
      firstName: 'Carolina',
      lastName: 'E2E',
      avatarPreset: 3,
      timezoneChangedAt: null,
      reminderTime: '21:00:00',
    })
    expect(state.getClaims).toHaveBeenCalledTimes(1)
    expect(state.from).toHaveBeenCalledTimes(1)
  })
})

describe('getSessionUser (auth only)', () => {
  it('returns id and the email claim without reading a profile', async () => {
    expect(await getSessionUser()).toEqual({ id: 'u1', email: 'a@b.cl' })
    expect(state.from).not.toHaveBeenCalled()
  })

  it.each([
    ['a malformed token (SyntaxError)', new SyntaxError('Unexpected token')],
    ['an unknown alg', new Error('Invalid alg claim')],
    ['a network error', new TypeError('fetch failed')],
  ])('treats %s as signed out instead of throwing', async (_n, err) => {
    state.claimsThrows = err
    expect(await getSessionUser()).toBeNull()
    expect(await getViewer()).toBeNull()
    expect(state.from).not.toHaveBeenCalled()
  })
})

describe('viewerMissingDestination', () => {
  it('sends a signed-out visitor to /bienvenida', async () => {
    state.claims = null
    expect(await viewerMissingDestination()).toBe('/bienvenida')
  })
  it('keeps /login?error=perfil for a signed-in user without a profile row', async () => {
    state.profile = null
    expect(await getViewer()).toBeNull()
    expect(await viewerMissingDestination()).toBe('/login?error=perfil')
  })
})
