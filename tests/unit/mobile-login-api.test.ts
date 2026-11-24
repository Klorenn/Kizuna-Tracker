import { describe, expect, it } from 'vitest'
import { LOGIN_GENERIC_ERROR, LOGIN_RATE_LIMITED_ERROR, type LoginDeps } from '@/lib/login'
import { mobileLogin, type MobileSession } from '@/lib/mobile-login-api'

const SESSION: MobileSession = { access_token: 'a.b.c', refresh_token: 'r', expires_at: 1800000000 }

/** Fake deps: one account (pau@x.co / @pau) with password "ok-password"; `limited` trips the limiter. */
function fake(opts: { limited?: boolean } = {}) {
  const attempts: string[][] = []
  const make = (capture: (s: MobileSession) => void): LoginDeps => ({
    async registerAttempt(keys) { attempts.push(keys); return !opts.limited },
    async resolveAccount(id) {
      return id.value === 'pau@x.co' || id.value === 'pau' ? { userId: 'u1', email: 'pau@x.co' } : null
    },
    async signInWithPassword(email, password) {
      if (email === 'pau@x.co' && password === 'ok-password') { capture(SESSION); return { ok: true } }
      return { ok: false }
    },
  })
  return { make, attempts }
}

describe('mobileLogin', () => {
  it('200 with the session for email and for @usuario', async () => {
    const f = fake()
    for (const identifier of ['pau@x.co', '@pau']) {
      const r = await mobileLogin({ body: { identifier, password: 'ok-password' }, ip: '1.1.1.1' }, f.make)
      expect(r).toEqual({ status: 200, body: { ok: true, session: SESSION } })
    }
  })
  it('401 with the web generic copy for a wrong password and for an unknown user', async () => {
    const f = fake()
    const bad = { status: 401, body: { ok: false, error: LOGIN_GENERIC_ERROR } }
    expect(await mobileLogin({ body: { identifier: 'pau@x.co', password: 'nope' }, ip: null }, f.make)).toEqual(bad)
    expect(await mobileLogin({ body: { identifier: '@nadie', password: 'ok-password' }, ip: null }, f.make)).toEqual(bad)
  })
  it('429 with the limiter copy and a Retry-After, no session', async () => {
    const f = fake({ limited: true })
    const r = await mobileLogin({ body: { identifier: 'pau@x.co', password: 'ok-password' }, ip: '1.1.1.1' }, f.make)
    expect(r.status).toBe(429)
    expect(r.body).toEqual({ ok: false, error: LOGIN_RATE_LIMITED_ERROR })
    expect(r.retryAfter).toBeGreaterThan(0)
  })
  it('passes the ip key to the limiter', async () => {
    const f = fake()
    await mobileLogin({ body: { identifier: 'pau@x.co', password: 'ok-password' }, ip: '9.9.9.9' }, f.make)
    expect(f.attempts[0]).toEqual(['id:pau@x.co', 'ip:9.9.9.9'])
  })
  it.each([
    [null], ['str'], [[]], [{}], [{ identifier: 1, password: 'x' }], [{ identifier: 'a@b.co' }],
    [{ identifier: 'a'.repeat(321), password: 'x' }], [{ identifier: 'a@b.co', password: 5 }],
  ])('400 for a malformed body %j', async (body) => {
    const r = await mobileLogin({ body, ip: null }, fake().make)
    expect(r).toEqual({ status: 400, body: { ok: false, error: LOGIN_GENERIC_ERROR } })
  })
  it('accepts an identifier of exactly 320 characters (limit is exclusive of 321)', async () => {
    const r = await mobileLogin({ body: { identifier: 'a'.repeat(320), password: 'x' }, ip: null }, fake().make)
    expect(r.status).toBe(401)
  })
  it('401 when sign-in says ok but no session was captured', async () => {
    const make = (): LoginDeps => ({
      registerAttempt: async () => true,
      resolveAccount: async () => ({ userId: 'u', email: 'a@b.co' }),
      signInWithPassword: async () => ({ ok: true }),
    })
    expect((await mobileLogin({ body: { identifier: 'a@b.co', password: 'x' }, ip: null }, make)).status).toBe(401)
  })
})
