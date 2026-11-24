import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyOtp = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => ({ auth: { verifyOtp } }) }))

import { GET } from '@/app/auth/native-handoff/route'

const get = (qs: string) => GET(new Request(`https://kizuna.example/auth/native-handoff?${qs}`, { headers: { host: 'kizuna.example' } }))

describe('GET /auth/native-handoff', () => {
  beforeEach(() => verifyOtp.mockReset())

  it('verifies the magiclink token with the cookie client and redirects to the next path', async () => {
    verifyOtp.mockResolvedValue({ error: null })
    const res = await get('token_hash=hash_abc-123_DEF456&next=%2Fretos%2F123')
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'magiclink', token_hash: 'hash_abc-123_DEF456' })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://kizuna.example/retos/123')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
  })
  it('an expired link redirects to /login', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'expired' } })
    expect((await get('token_hash=hash_abc-123_DEF456&next=%2Fretos')).headers.get('location')).toBe('https://kizuna.example/login')
  })
  it('an open-redirect next is replaced by /', async () => {
    verifyOtp.mockResolvedValue({ error: null })
    expect((await get('token_hash=hash_abc-123_DEF456&next=%2F%2Fevil.com')).headers.get('location')).toBe('https://kizuna.example/')
  })
})
