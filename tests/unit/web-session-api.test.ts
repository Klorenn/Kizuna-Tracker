import { describe, expect, it, vi } from 'vitest'
import { webSession, type WebSessionDeps } from '@/lib/web-session-api'

const ORIGIN = 'https://kizuna.example'
function deps(over: Partial<WebSessionDeps> = {}): WebSessionDeps {
  return { registerAttempt: vi.fn(async () => true), hashedTokenFor: vi.fn(async () => 'hash_abc-123_DEF456'), ...over }
}
const run = (body: unknown, d = deps()) => webSession({ body, userId: 'u1', origin: ORIGIN }, d)

describe('webSession', () => {
  it('answers the handoff url with the one-time token and the encoded next path', async () => {
    const d = deps()
    const res = await run({ path: '/retos/123' }, d)
    expect(res).toEqual({
      status: 200,
      body: { ok: true, url: `${ORIGIN}/auth/native-handoff?token_hash=hash_abc-123_DEF456&next=%2Fretos%2F123` },
    })
    expect(d.hashedTokenFor).toHaveBeenCalledWith('u1')
  })
  it('keeps a short query of the path inside the encoded next', async () => {
    const res = await run({ path: '/grupos/abc?seccion=fondo' })
    expect((res.body as { url: string }).url).toContain('next=%2Fgrupos%2Fabc%3Fseccion%3Dfondo')
  })
  it('400 for an unsafe or missing path, no limiter hit and no link generated', async () => {
    const d = deps()
    for (const body of [null, {}, { path: '//evil.com' }, { path: 'https://evil.com' }, { path: '/a/../b' }, { path: 7 }]) {
      expect((await run(body, d)).status).toBe(400)
    }
    expect(d.registerAttempt).not.toHaveBeenCalled()
    expect(d.hashedTokenFor).not.toHaveBeenCalled()
  })
  it('rate limits per user with the 60/15min key family and answers 429 with Retry-After', async () => {
    const d = deps({ registerAttempt: vi.fn(async () => false) })
    const res = await run({ path: '/retos' }, d)
    expect(d.registerAttempt).toHaveBeenCalledWith('chk:handoff:u1')
    expect(res).toMatchObject({ status: 429, retryAfter: 900 })
    expect(d.hashedTokenFor).not.toHaveBeenCalled()
  })
  it('500 when no link can be generated, without leaking why', async () => {
    expect(await run({ path: '/retos' }, deps({ hashedTokenFor: vi.fn(async () => null) }))).toEqual({ status: 500, body: { ok: false, error: 'unavailable' } })
    expect((await run({ path: '/retos' }, deps({ hashedTokenFor: vi.fn(async () => { throw new Error('secret') }) }))).status).toBe(500)
  })
})
