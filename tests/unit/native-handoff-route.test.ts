import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyOtp = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => ({ auth: { verifyOtp } }) }))

import { GET } from '@/app/auth/native-handoff/route'

const UA = 'Mozilla/5.0 (Linux; Android 14) Chrome/126 Mobile Safari/537.36 KizunaNative/1'
const NATIVE = { host: 'kizuna.example', 'user-agent': UA, 'x-kizuna-native': '1' }
const get = (qs: string, headers: Record<string, string> = NATIVE) => GET(new Request(`https://kizuna.example/auth/native-handoff?${qs}`, { headers }))

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

  it('a browser (no marker at all) gets 403 and the token is never verified: no login CSRF', async () => {
    const res = await get('token_hash=hash_abc-123_DEF456&next=%2Fretos', { host: 'kizuna.example', 'user-agent': 'Mozilla/5.0 Chrome/126' })
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(verifyOtp).not.toHaveBeenCalled()
  })
  it('the UA marker alone is not enough (an attacker can send a UA), nor is the header alone', async () => {
    expect((await get('token_hash=hash_abc-123_DEF456', { host: 'kizuna.example', 'user-agent': UA })).status).toBe(403)
    expect((await get('token_hash=hash_abc-123_DEF456', { host: 'kizuna.example', 'user-agent': 'Chrome', 'x-kizuna-native': '1' })).status).toBe(403)
    expect((await get('token_hash=hash_abc-123_DEF456', { host: 'kizuna.example', 'user-agent': UA, 'x-kizuna-native': '0' })).status).toBe(403)
    expect(verifyOtp).not.toHaveBeenCalled()
  })
  it('a next that is itself a handoff is replaced by /', async () => {
    verifyOtp.mockResolvedValue({ error: null })
    const res = await get('token_hash=hash_abc-123_DEF456&next=%2Fauth%2Fnative-handoff%3Ftoken_hash%3DX')
    expect(res.headers.get('location')).toBe('https://kizuna.example/')
  })
})
