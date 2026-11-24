import { describe, expect, it, vi } from 'vitest'
import { isExpoPushToken, registerPushToken, removePushToken, type PushTokenDeps } from '@/lib/push-token-api'

const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'

function deps(over: Partial<PushTokenDeps> = {}): PushTokenDeps {
  return { upsertToken: vi.fn(async () => {}), deleteToken: vi.fn(async () => {}), ...over }
}

describe('isExpoPushToken', () => {
  it('accepts both Expo spellings and rejects anything else', () => {
    expect(isExpoPushToken('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]')).toBe(true)
    expect(isExpoPushToken('ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]')).toBe(true)
    expect(isExpoPushToken('ExponentPushToken[short]')).toBe(false)
    expect(isExpoPushToken('https://evil.example/x')).toBe(false)
    expect(isExpoPushToken(42)).toBe(false)
  })
})

describe('registerPushToken', () => {
  it('upserts the token for the verified user', async () => {
    const d = deps()
    const res = await registerPushToken({ body: { token: TOKEN }, userId: 'u1' }, d)
    expect(res).toEqual({ status: 200, body: { ok: true } })
    expect(d.upsertToken).toHaveBeenCalledWith('u1', TOKEN)
  })
  it('ignores a user_id in the body: the verified user wins', async () => {
    const d = deps()
    await registerPushToken({ body: { token: TOKEN, user_id: 'attacker' }, userId: 'u1' }, d)
    expect(d.upsertToken).toHaveBeenCalledWith('u1', TOKEN)
  })
  it('a rotated token is another upsert for the same user', async () => {
    const d = deps()
    await registerPushToken({ body: { token: TOKEN }, userId: 'u1' }, d)
    await registerPushToken({ body: { token: 'ExponentPushToken[zzzzzzzzzzzzzzzzzzzzzz]' }, userId: 'u1' }, d)
    expect(d.upsertToken).toHaveBeenNthCalledWith(2, 'u1', 'ExponentPushToken[zzzzzzzzzzzzzzzzzzzzzz]')
  })
  it('400 on a malformed body or token, nothing stored', async () => {
    const d = deps()
    for (const body of [null, 'x', [], {}, { token: 7 }, { token: 'nope' }]) {
      expect((await registerPushToken({ body, userId: 'u1' }, d)).status).toBe(400)
    }
    expect(d.upsertToken).not.toHaveBeenCalled()
  })
  it('500 when the store fails, without leaking the error', async () => {
    const d = deps({ upsertToken: vi.fn(async () => { throw new Error('db down secret') }) })
    const res = await registerPushToken({ body: { token: TOKEN }, userId: 'u1' }, d)
    expect(res).toEqual({ status: 500, body: { ok: false, error: 'unavailable' } })
  })
})

describe('removePushToken', () => {
  it('deletes only the pair (user, token)', async () => {
    const d = deps()
    const res = await removePushToken({ body: { token: TOKEN }, userId: 'u1' }, d)
    expect(res).toEqual({ status: 200, body: { ok: true } })
    expect(d.deleteToken).toHaveBeenCalledWith('u1', TOKEN)
  })
  it('400 without a valid token; 500 on a store failure', async () => {
    const d = deps({ deleteToken: vi.fn(async () => { throw new Error('x') }) })
    expect((await removePushToken({ body: {}, userId: 'u1' }, d)).status).toBe(400)
    expect((await removePushToken({ body: { token: TOKEN }, userId: 'u1' }, d)).status).toBe(500)
  })
})
