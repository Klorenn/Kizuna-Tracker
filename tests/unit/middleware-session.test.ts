import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Claims = { sub?: string } | null
type Cookie = { name: string; value: string; options?: object }
const state = {
  claims: { sub: 'u1' } as Claims,
  claimsError: null as unknown,
  profile: { id: 'u1' } as { id: string } | null,
  profileError: null as unknown,
  profileEq: [] as unknown[][],
  profileIs: [] as unknown[][],
  claimsThrows: null as unknown,
  getUser: vi.fn(),
  getClaims: vi.fn(),
  signOut: vi.fn(),
  setAll: undefined as undefined | ((l: Cookie[]) => void),
}

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_u: string, _k: string, opts: { cookies: { setAll: (l: Cookie[]) => void } }) => {
    state.setAll = opts.cookies.setAll
    return {
      auth: { getUser: state.getUser, getClaims: state.getClaims, signOut: state.signOut },
      from: () => {
        const q = {
          select: () => q,
          eq: (...a: unknown[]) => {
            state.profileEq.push(a)
            return q
          },
          is: (...a: unknown[]) => {
            state.profileIs.push(a)
            return q
          },
          maybeSingle: async () => ({ data: state.profile, error: state.profileError }),
        }
        return q
      },
    }
  },
}))

import { updateSession } from '@/lib/supabase/middleware'

const req = (path: string) => new NextRequest(new URL(`http://localhost:3000${path}`))
const location = (res: Response) => (res.headers.get('location') ? new URL(res.headers.get('location')!) : null)

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://x'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'k'
  state.claims = { sub: 'u1' }
  state.claimsError = null
  state.profile = { id: 'u1' }
  state.profileError = null
  state.profileEq = []
  state.profileIs = []
  state.claimsThrows = null
  state.getUser.mockReset().mockRejectedValue(new Error('getUser must not be called'))
  state.getClaims.mockReset().mockImplementation(async () => {
    if (state.claimsThrows) throw state.claimsThrows
    return { data: state.claims ? { claims: state.claims } : null, error: state.claimsError }
  })
  state.signOut.mockReset().mockResolvedValue({ error: null })
})

describe('updateSession', () => {
  it('verifies the session with getClaims, never the Auth HTTP call getUser', async () => {
    const res = await updateSession(req('/amigos'))
    expect(state.getClaims).toHaveBeenCalledTimes(1)
    expect(state.getUser).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBeNull()
  })

  it('valid claims on a protected page pass through and gate on the claims subject profile', async () => {
    const res = await updateSession(req('/retos'))
    expect(res.status).toBe(200)
    expect(state.profileEq).toContainEqual(['id', 'u1'])
  })

  it('an expired session that refreshes lets the request through and forwards the new cookies', async () => {
    state.getClaims.mockImplementation(async () => {
      state.setAll?.([{ name: 'sb-access', value: 'fresh', options: { path: '/' } }])
      return { data: { claims: { sub: 'u1' } }, error: null }
    })
    const res = await updateSession(req('/perfil'))
    expect(res.status).toBe(200)
    expect(res.cookies.get('sb-access')?.value).toBe('fresh')
  })

  it('no session on a protected page redirects to login', async () => {
    state.claims = null
    const res = await updateSession(req('/amigos'))
    const loc = location(res)!
    expect(loc.pathname).toBe('/login')
    expect(loc.searchParams.get('next')).toBeNull()
  })

  it('an invalid token that cannot refresh ends at the login redirect', async () => {
    state.claims = null
    state.claimsError = { message: 'invalid JWT' }
    const res = await updateSession(req('/resumen'))
    expect(location(res)!.pathname).toBe('/login')
  })

  it('claims without a subject count as no session', async () => {
    state.claims = {}
    const res = await updateSession(req('/amigos'))
    expect(location(res)!.pathname).toBe('/login')
  })

  it('no session on / goes to the welcome page', async () => {
    state.claims = null
    const res = await updateSession(req('/'))
    expect(location(res)!.pathname).toBe('/bienvenida')
  })

  it('no session on a public page passes through', async () => {
    state.claims = null
    const res = await updateSession(req('/login'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('a deleted profile is signed out and sent to login?error=perfil', async () => {
    state.profile = null
    const res = await updateSession(req('/'))
    expect(state.signOut).toHaveBeenCalledTimes(1)
    const loc = location(res)!
    expect(loc.pathname).toBe('/login')
    expect(loc.searchParams.get('error')).toBe('perfil')
  })

  it('a failed profile query lets the user through without signing out', async () => {
    state.profile = null
    state.profileError = { message: 'timeout' }
    const res = await updateSession(req('/'))
    expect(state.signOut).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBeNull()
  })

  it('a signed-in user on an auth page goes to the app', async () => {
    const res = await updateSession(req('/login'))
    expect(location(res)!.pathname).toBe('/')
  })
})

describe('the deleted-account gate', () => {
  it('only counts profiles that are not soft-deleted (is deleted_at null) and match the claims subject', async () => {
    await updateSession(req('/amigos'))
    expect(state.profileIs).toEqual([['deleted_at', null]])
    expect(state.profileEq).toEqual([['id', 'u1']])
  })
})

describe('getClaims throwing (not an Auth error)', () => {
  const cases: [string, unknown][] = [
    ['a malformed token (SyntaxError)', new SyntaxError('Unexpected token } in JSON')],
    ['an unknown alg', new Error('Invalid alg claim')],
    ['a network error', new TypeError('fetch failed')],
  ]

  it.each(cases)('%s on a protected page is a signed-out visitor: login redirect, no sign-out, no throw', async (_n, err) => {
    state.claimsThrows = err
    const res = await updateSession(req('/amigos'))
    expect(location(res)!.pathname).toBe('/login')
    expect(state.signOut).not.toHaveBeenCalled()
    expect(res.cookies.getAll()).toEqual([])
  })

  it.each(cases)('%s on /login passes through, so the user can sign in again', async (_n, err) => {
    state.claimsThrows = err
    const res = await updateSession(req('/login'))
    expect(res.headers.get('location')).toBeNull()
    expect(state.signOut).not.toHaveBeenCalled()
  })

  it('on / goes to the welcome page', async () => {
    state.claimsThrows = new SyntaxError('x')
    const res = await updateSession(req('/'))
    expect(location(res)!.pathname).toBe('/bienvenida')
  })
})
