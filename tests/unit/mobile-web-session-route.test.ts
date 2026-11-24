import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyJwt = vi.fn()
const rpc = vi.fn()
const getUserById = vi.fn()
const generateLink = vi.fn()
vi.mock('@/lib/supabase/bearer', () => ({ verifyJwt: (jwt: string) => verifyJwt(jwt) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc, auth: { admin: { getUserById, generateLink } } }) }))

import { POST } from '@/app/api/m/web-session/route'

const req = (headers: Record<string, string>, body: unknown = { path: '/retos' }) =>
  new Request('https://kizuna.example/api/m/web-session', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', host: 'kizuna.example', ...headers } })
const AUTH = { authorization: 'Bearer aaa.bbb.ccc' }

describe('POST /api/m/web-session', () => {
  beforeEach(() => { verifyJwt.mockReset(); rpc.mockReset(); getUserById.mockReset(); generateLink.mockReset() })

  it('401 without a bearer token: no link is generated', async () => {
    expect((await POST(req({}))).status).toBe(401)
    expect(generateLink).not.toHaveBeenCalled()
  })
  it('generates a magic link for the verified user only and returns the handoff url, uncached', async () => {
    verifyJwt.mockResolvedValue({ sub: 'u1' })
    rpc.mockResolvedValue({ data: true, error: null })
    getUserById.mockResolvedValue({ data: { user: { email: 'pau@x.co' } }, error: null })
    generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'hash_abc-123_DEF456' } }, error: null })
    const res = await POST(req(AUTH, { path: '/retos', user_id: 'evil' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(getUserById).toHaveBeenCalledWith('u1')
    expect(generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'pau@x.co' })
    expect(rpc).toHaveBeenCalledWith('register_login_attempt', { p_keys: ['chk:handoff:u1'] })
    expect((await res.json()).url).toBe('https://kizuna.example/auth/native-handoff?token_hash=hash_abc-123_DEF456&next=%2Fretos')
  })
  it('429 when the limiter says no, nothing generated', async () => {
    verifyJwt.mockResolvedValue({ sub: 'u1' })
    rpc.mockResolvedValue({ data: false, error: null })
    const res = await POST(req(AUTH))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('900')
    expect(generateLink).not.toHaveBeenCalled()
  })
  it('the limiter failing closes the door (429), it never skips the check', async () => {
    verifyJwt.mockResolvedValue({ sub: 'u1' })
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
    expect((await POST(req(AUTH))).status).toBe(429)
    expect(generateLink).not.toHaveBeenCalled()
  })
})
