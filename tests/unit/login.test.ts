import { describe, expect, it, vi } from 'vitest'
import {
  LOGIN_GENERIC_ERROR,
  LOGIN_RATE_LIMITED_ERROR,
  loginWith,
  parseIdentifier,
  type LoginDeps,
} from '@/lib/login'

describe('parseIdentifier', () => {
  it('detects emails', () => {
    expect(parseIdentifier('pau@kizuna.app')).toEqual({ kind: 'email', email: 'pau@kizuna.app' })
    expect(parseIdentifier('  Pau@Kizuna.app ')).toEqual({ kind: 'email', email: 'pau@kizuna.app' })
  })
  it('detects @usuario', () => {
    expect(parseIdentifier('@Pau_K')).toEqual({ kind: 'username', username: 'pau_k' })
    expect(parseIdentifier('pau_k')).toEqual({ kind: 'username', username: 'pau_k' })
  })
  it('rejects the rest', () => {
    expect(parseIdentifier('a b')).toEqual({ kind: 'invalid' })
    expect(parseIdentifier('')).toEqual({ kind: 'invalid' })
    expect(parseIdentifier('@')).toEqual({ kind: 'invalid' })
  })
})

function deps() {
  return {
    registerAttempt: vi.fn<LoginDeps['registerAttempt']>(async () => true),
    emailForUsername: vi.fn(async (u: string): Promise<string | null> =>
      u === 'pau_k' ? 'pau@kizuna.app' : null,
    ),
    signInWithPassword: vi.fn(async (_e: string, p: string) => ({ ok: p === 'kizuna-2026' })),
  } satisfies LoginDeps
}
const ip = '203.0.113.7'

describe('loginWith', () => {
  it('unknown @usuario takes the same path and returns the generic error', async () => {
    const d = deps()
    const res = await loginWith(d, { identifier: '@nadie', password: 'x' }, ip)
    expect(res).toEqual({ ok: false, error: LOGIN_GENERIC_ERROR })
    expect(d.signInWithPassword).toHaveBeenCalledTimes(1)
    expect(d.signInWithPassword.mock.calls[0][0]).toMatch(/@invalid\.kizuna$/)
  })

  it('wrong password of an existing user gives the identical result', async () => {
    const d = deps()
    const unknown = await loginWith(deps(), { identifier: '@nadie', password: 'x' }, ip)
    const wrong = await loginWith(d, { identifier: '@pau_k', password: 'mala' }, ip)
    expect(wrong).toEqual(unknown)
    expect(d.signInWithPassword).toHaveBeenCalledWith('pau@kizuna.app', 'mala')
  })

  it('invalid identifier also returns the generic error', async () => {
    const res = await loginWith(deps(), { identifier: 'a b', password: 'x' }, ip)
    expect(res).toEqual({ ok: false, error: LOGIN_GENERIC_ERROR })
  })

  it('rate limited: no sign-in attempt', async () => {
    const d = { ...deps(), registerAttempt: vi.fn<LoginDeps['registerAttempt']>(async () => false) }
    const res = await loginWith(d, { identifier: '@pau_k', password: 'kizuna-2026' }, ip)
    expect(res).toEqual({ ok: false, error: LOGIN_RATE_LIMITED_ERROR })
    expect(d.signInWithPassword).not.toHaveBeenCalled()
    expect(d.emailForUsername).not.toHaveBeenCalled()
  })

  it('registers id and ip keys', async () => {
    const d = deps()
    await loginWith(d, { identifier: '@Pau_K', password: 'kizuna-2026' }, ip)
    expect(d.registerAttempt).toHaveBeenCalledWith(['id:pau_k', 'ip:203.0.113.7'])
  })

  it('email login keys by normalized email', async () => {
    const d = deps()
    await loginWith(d, { identifier: 'Pau@Kizuna.app', password: 'kizuna-2026' }, ip)
    expect(d.registerAttempt).toHaveBeenCalledWith(['id:pau@kizuna.app', 'ip:203.0.113.7'])
    expect(d.signInWithPassword).toHaveBeenCalledWith('pau@kizuna.app', 'kizuna-2026')
    expect(d.emailForUsername).not.toHaveBeenCalled()
  })

  it('succeeds', async () => {
    const res = await loginWith(deps(), { identifier: '@pau_k', password: 'kizuna-2026' }, ip)
    expect(res).toEqual({ ok: true })
  })
})
