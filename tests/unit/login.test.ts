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
    resolveAccount: vi.fn(
      async (id: { kind: 'email' | 'username'; value: string }): Promise<{ userId: string; email: string } | null> =>
        id.value === 'pau_k' || id.value === 'pau@kizuna.app'
          ? { userId: 'uid-1', email: 'pau@kizuna.app' }
          : null,
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
    expect(d.resolveAccount).not.toHaveBeenCalled()
  })

  it('registers id and ip keys', async () => {
    const d = deps()
    await loginWith(d, { identifier: '@Pau_K', password: 'kizuna-2026' }, ip)
    expect(d.registerAttempt).toHaveBeenNthCalledWith(1, ['id:pau_k', 'ip:203.0.113.7'])
  })

  it('email login keys by normalized email', async () => {
    const d = deps()
    await loginWith(d, { identifier: 'Pau@Kizuna.app', password: 'kizuna-2026' }, ip)
    expect(d.registerAttempt).toHaveBeenNthCalledWith(1, ['id:pau@kizuna.app', 'ip:203.0.113.7'])
    expect(d.signInWithPassword).toHaveBeenCalledWith('pau@kizuna.app', 'kizuna-2026')
  })

  it('email and handle share the per-account counter', async () => {
    const byHandle = deps()
    const byEmail = deps()
    await loginWith(byHandle, { identifier: '@pau_k', password: 'x' }, ip)
    await loginWith(byEmail, { identifier: 'pau@kizuna.app', password: 'x' }, ip)
    expect(byHandle.registerAttempt).toHaveBeenNthCalledWith(2, ['uid:uid-1'])
    expect(byEmail.registerAttempt).toHaveBeenNthCalledWith(2, ['uid:uid-1'])
  })

  it('unknown accounts count uid:<normalized identifier> and still sign in', async () => {
    const d = deps()
    await loginWith(d, { identifier: '@Nadie', password: 'x' }, ip)
    expect(d.registerAttempt).toHaveBeenNthCalledWith(2, ['uid:nadie'])
    expect(d.signInWithPassword).toHaveBeenCalledTimes(1)
  })

  it('blocks when the account counter is exceeded, without signing in', async () => {
    const d = deps()
    d.registerAttempt.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const res = await loginWith(d, { identifier: 'pau@kizuna.app', password: 'kizuna-2026' }, ip)
    expect(res).toEqual({ ok: false, error: LOGIN_RATE_LIMITED_ERROR })
    expect(d.signInWithPassword).not.toHaveBeenCalled()
  })

  it('skips the ip key when the ip is unknown', async () => {
    const d = deps()
    await loginWith(d, { identifier: '@pau_k', password: 'kizuna-2026' }, null)
    expect(d.registerAttempt).toHaveBeenNthCalledWith(1, ['id:pau_k'])
  })

  it('succeeds', async () => {
    const res = await loginWith(deps(), { identifier: '@pau_k', password: 'kizuna-2026' }, ip)
    expect(res).toEqual({ ok: true })
  })
})
