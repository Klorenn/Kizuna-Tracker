import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { claimsToVerified, createBearerClient, verifyJwtWith } from '@/lib/supabase/bearer'

type ClaimsResult = { data: { claims: Record<string, unknown> } | null; error: unknown }
const stub = (r: ClaimsResult | Error) => ({
  auth: { getClaims: vi.fn(async () => { if (r instanceof Error) throw r; return r }) },
})

describe('claimsToVerified', () => {
  it('accepts an authenticated sub', () => {
    expect(claimsToVerified({ sub: 'u-1', role: 'authenticated' })).toEqual({ sub: 'u-1' })
  })
  it.each([
    [{ sub: 'u-1', role: 'anon' }],
    [{ sub: 'u-1', role: 'service_role' }],
    [{ role: 'authenticated' }],
    [{ sub: '', role: 'authenticated' }],
    [{ sub: 42, role: 'authenticated' }],
    [{}],
  ])('rejects %j', (c) => expect(claimsToVerified(c as Record<string, unknown>)).toBeNull())
})

describe('verifyJwtWith', () => {
  it('returns the sub for good claims and passes the jwt through', async () => {
    const c = stub({ data: { claims: { sub: 'u-9', role: 'authenticated' } }, error: null })
    expect(await verifyJwtWith(c, 'a.b.c')).toEqual({ sub: 'u-9' })
    expect(c.auth.getClaims).toHaveBeenCalledWith('a.b.c')
  })
  it('null for bad claims, an error, no data, or a throw', async () => {
    expect(await verifyJwtWith(stub({ data: { claims: { sub: 'u', role: 'anon' } }, error: null }), 'a.b.c')).toBeNull()
    expect(await verifyJwtWith(stub({ data: null, error: new Error('invalid') }), 'a.b.c')).toBeNull()
    expect(await verifyJwtWith(stub({ data: null, error: null }), 'a.b.c')).toBeNull()
    expect(await verifyJwtWith(stub(new Error('jwks down')), 'a.b.c')).toBeNull()
  })
})

describe('createBearerClient', () => {
  it('throws when the Supabase public config is missing', () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const su = process.env.SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_URL
    try {
      expect(() => createBearerClient('a.b.c')).toThrow('Supabase public configuration is missing')
    } finally {
      if (url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = url
      if (su !== undefined) process.env.SUPABASE_URL = su
    }
  })
  it('builds a non-persisting client when configured', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-test'
    const c = createBearerClient('a.b.c')
    expect(typeof c.auth.getClaims).toBe('function')
    expect(typeof c.rpc).toBe('function')
  })
})
