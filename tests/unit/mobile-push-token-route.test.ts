import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyJwt = vi.fn()
const upsert = vi.fn()
const deleteMatch = vi.fn()
vi.mock('@/lib/supabase/bearer', () => ({ verifyJwt: (jwt: string) => verifyJwt(jwt) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: (...a: unknown[]) => { upsert(...a); return Promise.resolve({ error: null }) },
      delete: () => ({ eq: (c1: string, v1: string) => ({ eq: (c2: string, v2: string) => { deleteMatch(c1, v1, c2, v2); return Promise.resolve({ error: null }) } }) }),
    }),
  }),
}))

import { DELETE, POST } from '@/app/api/m/push-token/route'

const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'
const req = (method: string, headers: Record<string, string>, body: unknown = { token: TOKEN }) =>
  new Request('http://x/api/m/push-token', { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } })

describe('/api/m/push-token', () => {
  beforeEach(() => { verifyJwt.mockReset(); upsert.mockReset(); deleteMatch.mockReset() })

  it('401 without a bearer token, nothing written', async () => {
    expect((await POST(req('POST', {}))).status).toBe(401)
    expect((await DELETE(req('DELETE', {}))).status).toBe(401)
    expect(upsert).not.toHaveBeenCalled()
    expect(deleteMatch).not.toHaveBeenCalled()
  })
  it('POST upserts on token with the verified user, so an account switch reassigns the device', async () => {
    verifyJwt.mockResolvedValue({ sub: 'u1' })
    const res = await POST(req('POST', { authorization: 'Bearer aaa.bbb.ccc' }, { token: TOKEN, user_id: 'evil' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const [row, opts] = upsert.mock.calls[0]
    expect(row).toMatchObject({ user_id: 'u1', token: TOKEN })
    expect(opts).toEqual({ onConflict: 'token' })
  })
  it('DELETE removes only the caller\'s own row', async () => {
    verifyJwt.mockResolvedValue({ sub: 'u1' })
    expect((await DELETE(req('DELETE', { authorization: 'Bearer aaa.bbb.ccc' }))).status).toBe(200)
    expect(deleteMatch).toHaveBeenCalledWith('user_id', 'u1', 'token', TOKEN)
  })
  it('415 for a body that is not JSON', async () => {
    verifyJwt.mockResolvedValue({ sub: 'u1' })
    const r = new Request('http://x/api/m/push-token', { method: 'POST', body: 'x', headers: { authorization: 'Bearer aaa.bbb.ccc', 'content-type': 'text/plain' } })
    expect((await POST(r)).status).toBe(415)
    expect(upsert).not.toHaveBeenCalled()
  })
})
