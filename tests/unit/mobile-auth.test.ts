import { describe, expect, it } from 'vitest'
import { bearerToken, requireUser } from '@/lib/mobile-auth'

const JWT = 'aaa.bbb.ccc'
const JWT_B = 'eyJhbGciOi-_.eyJzdWIiOiJ1.sig_-9'

describe('bearerToken', () => {
  it('extracts a well-formed JWT', () => {
    expect(bearerToken(`Bearer ${JWT}`)).toBe(JWT)
    expect(bearerToken(`Bearer ${JWT_B}`)).toBe(JWT_B)
  })
  it.each([null, undefined, '', 'Bearer ', 'Bearer a.b', 'Bearer a.b.c.d', `bearer ${JWT}`, `Basic ${JWT}`, `Bearer ${JWT} x`, `Bearer  ${JWT}`, 'Bearer a.b.c$'])(
    'rejects %s',
    (h) => expect(bearerToken(h as string | null | undefined)).toBeNull(),
  )
  it('rejects a token over 4096 characters', () => {
    expect(bearerToken(`Bearer ${'a'.repeat(4094)}.b.c`)).toBeNull()
    expect(bearerToken(`Bearer ${'a'.repeat(4080)}.b.c`)).not.toBeNull()
  })
})

describe('requireUser', () => {
  const ok = { verify: async (jwt: string) => (jwt === JWT ? { sub: 'u-1' } : null) }
  it('returns the verified sub and the jwt', async () => {
    expect(await requireUser(new Headers({ authorization: `Bearer ${JWT}` }), ok)).toEqual({ ok: true, userId: 'u-1', jwt: JWT })
  })
  it('401 with no header', async () => {
    expect(await requireUser(new Headers(), ok)).toEqual({ ok: false, status: 401 })
  })
  it('401 with a malformed header, without calling verify', async () => {
    let called = false
    const r = await requireUser(new Headers({ authorization: 'Bearer nope' }), { verify: async () => ((called = true), { sub: 'x' }) })
    expect(r).toEqual({ ok: false, status: 401 })
    expect(called).toBe(false)
  })
  it('401 when verify returns null or throws', async () => {
    expect(await requireUser(new Headers({ authorization: 'Bearer x.y.z' }), ok)).toEqual({ ok: false, status: 401 })
    const boom = { verify: async () => { throw new Error('jwks down') } }
    expect(await requireUser(new Headers({ authorization: `Bearer ${JWT}` }), boom)).toEqual({ ok: false, status: 401 })
  })
})
