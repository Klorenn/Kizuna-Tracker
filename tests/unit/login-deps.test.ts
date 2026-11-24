import { describe, expect, it, vi } from 'vitest'
import { loginDeps } from '@/lib/login-deps'

type Rpc = ReturnType<typeof vi.fn>
const admin = (rpc: Rpc) => ({ rpc }) as unknown as Parameters<typeof loginDeps>[0]
const signIn = async () => ({ ok: true })

describe('loginDeps', () => {
  it('registerAttempt: true only when the RPC answers exactly true (fail closed)', async () => {
    const rpc = vi.fn()
    const deps = loginDeps(admin(rpc), signIn, '1.2.3.4')
    rpc.mockResolvedValueOnce({ data: true, error: null })
    expect(await deps.registerAttempt(['id:a'])).toBe(true)
    expect(rpc).toHaveBeenLastCalledWith('register_login_attempt', { p_keys: ['id:a'] })
    rpc.mockResolvedValueOnce({ data: false, error: null })
    expect(await deps.registerAttempt(['id:a'])).toBe(false)
    rpc.mockResolvedValueOnce({ data: true, error: { message: 'down' } })
    expect(await deps.registerAttempt(['id:a'])).toBe(false)
  })
  it('registerAttempt skips the limiter for a loopback ip in local development', async () => {
    const rpc = vi.fn()
    const skip = loginDeps(admin(rpc), signIn, '127.0.0.1', () => true)
    expect(await skip.registerAttempt(['id:a'])).toBe(true)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('resolveAccount maps the first row, else null', async () => {
    const rpc = vi.fn()
    const deps = loginDeps(admin(rpc), signIn, null)
    rpc.mockResolvedValueOnce({ data: [{ user_id: 'u1', email: 'a@b.co' }], error: null })
    expect(await deps.resolveAccount({ kind: 'username', value: 'pau' })).toEqual({ userId: 'u1', email: 'a@b.co' })
    expect(rpc).toHaveBeenLastCalledWith('account_for_login', { p_kind: 'username', p_value: 'pau' })
    rpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await deps.resolveAccount({ kind: 'email', value: 'x@y.zz' })).toBeNull()
    rpc.mockResolvedValueOnce({ data: [{ user_id: 'u1', email: 'a@b.co' }], error: { message: 'x' } })
    expect(await deps.resolveAccount({ kind: 'email', value: 'x@y.zz' })).toBeNull()
  })
  it('signInWithPassword delegates to the injected sign-in', async () => {
    const calls: string[][] = []
    const deps = loginDeps(admin(vi.fn()), async (e, p) => { calls.push([e, p]); return { ok: false } }, null)
    expect(await deps.signInWithPassword('a@b.co', 'pw')).toEqual({ ok: false })
    expect(calls).toEqual([['a@b.co', 'pw']])
  })
})
