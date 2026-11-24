import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { EXPO_CHUNK, postExpoMessages, sendPush, type ExpoMessage, type PushDeps } from '@/lib/push'

const payload = { title: 'Hola', body: 'Cuerpo', url: '/retos/123' }
const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/1', p256dh: 'p', auth: 'a' }
const tok = (i: number | string) => `ExponentPushToken[${String(i).padStart(22, 'x')}]`

function deps(over: Partial<PushDeps> = {}): PushDeps {
  return {
    listSubscriptions: vi.fn(async () => [sub]),
    deleteSubscription: vi.fn(async () => {}),
    send: vi.fn(async () => {}),
    listDeviceTokens: vi.fn(async () => [tok(1)]),
    deleteDeviceTokens: vi.fn(async () => {}),
    sendExpo: vi.fn(async (msgs: ExpoMessage[]) => msgs.map((_, i) => ({ status: 'ok' as const, id: `t-${msgs[i].to}` }))),
    saveTickets: vi.fn(async () => {}),
    ...over,
  }
}

describe('sendPush: Expo channel', () => {
  it('a user with a web subscription and a device token: both receive', async () => {
    const d = deps()
    await sendPush('u1', payload, d)
    expect(d.send).toHaveBeenCalledOnce()
    expect(d.sendExpo).toHaveBeenCalledOnce()
  })
  it('the Expo message carries the url, the default channel and high priority', async () => {
    const d = deps()
    await sendPush('u1', payload, d)
    expect(d.sendExpo).toHaveBeenCalledWith([
      { to: tok(1), title: 'Hola', body: 'Cuerpo', data: { url: '/retos/123' }, channelId: 'default', priority: 'high', sound: 'default' },
    ])
  })
  it('VAPID unset but device tokens exist: Expo still sends and the web channel is not touched', async () => {
    const d = deps({ vapidEnabled: false })
    await sendPush('u1', payload, d)
    expect(d.listSubscriptions).not.toHaveBeenCalled()
    expect(d.send).not.toHaveBeenCalled()
    expect(d.sendExpo).toHaveBeenCalledOnce()
  })
  it('no device tokens: the web behaviour is unchanged and Expo is never called', async () => {
    const d = deps({ listDeviceTokens: vi.fn(async () => []) })
    await sendPush('u1', payload, d)
    expect(d.send).toHaveBeenCalledOnce()
    expect(d.sendExpo).not.toHaveBeenCalled()
  })
  it('more than 100 tokens are sent in chunks of 100', async () => {
    const many = Array.from({ length: 250 }, (_, i) => tok(i))
    const d = deps({ listDeviceTokens: vi.fn(async () => many) })
    await sendPush('u1', payload, d)
    const sizes = (d.sendExpo as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as unknown[]).length)
    expect(EXPO_CHUNK).toBe(100)
    expect(sizes).toEqual([100, 100, 50])
  })
  it('an Expo failure does not block the VAPID delivery nor the caller', async () => {
    const d = deps({ sendExpo: vi.fn(async () => { throw new Error('exp.host down') }) })
    await expect(sendPush('u1', payload, d)).resolves.toBeUndefined()
    expect(d.send).toHaveBeenCalledOnce()
  })
  it('a listing failure on the web channel does not block Expo', async () => {
    const d = deps({ listSubscriptions: vi.fn(async () => { throw new Error('db') }) })
    await expect(sendPush('u1', payload, d)).resolves.toBeUndefined()
    expect(d.sendExpo).toHaveBeenCalledOnce()
  })
  it('a ticket with DeviceNotRegistered deletes that token; other errors keep it', async () => {
    const d = deps({
      listDeviceTokens: vi.fn(async () => [tok(1), tok(2), tok(3)]),
      sendExpo: vi.fn(async () => [
        { status: 'error' as const, message: 'gone', details: { error: 'DeviceNotRegistered' } },
        { status: 'error' as const, message: 'slow down', details: { error: 'MessageRateExceeded' } },
        { status: 'ok' as const, id: 'ticket-3' },
      ]),
    })
    await sendPush('u1', payload, d)
    expect(d.deleteDeviceTokens).toHaveBeenCalledOnce()
    expect(d.deleteDeviceTokens).toHaveBeenCalledWith([tok(1)])
    expect(d.saveTickets).toHaveBeenCalledWith([{ ticket_id: 'ticket-3', token: tok(3) }])
  })
  it('a ticket save failure is swallowed', async () => {
    const d = deps({ saveTickets: vi.fn(async () => { throw new Error('db') }) })
    await expect(sendPush('u1', payload, d)).resolves.toBeUndefined()
  })
  it('without Expo deps (older callers) only the web channel runs', async () => {
    const d: PushDeps = { listSubscriptions: vi.fn(async () => [sub]), deleteSubscription: vi.fn(async () => {}), send: vi.fn(async () => {}) }
    await sendPush('u1', payload, d)
    expect(d.send).toHaveBeenCalledOnce()
  })
})

describe('postExpoMessages', () => {
  afterEach(() => { vi.unstubAllEnvs() })
  const okResponse = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) }) as Response

  it('posts the batch as JSON to the Expo push API and returns the tickets', async () => {
    const fetchFn = vi.fn(async () => okResponse([{ status: 'ok', id: 'a' }]))
    const msgs: ExpoMessage[] = [{ to: tok(1), title: 't', body: 'b', data: { url: '/' }, channelId: 'default', priority: 'high', sound: 'default' }]
    const out = await postExpoMessages(msgs, fetchFn as unknown as typeof fetch)
    expect(out).toEqual([{ status: 'ok', id: 'a' }])
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://exp.host/--/api/v2/push/send')
    expect(JSON.parse(init.body as string)).toEqual(msgs)
    expect((init.headers as Record<string, string>).authorization).toBeUndefined()
  })
  it('adds the access token when EXPO_ACCESS_TOKEN is set', async () => {
    vi.stubEnv('EXPO_ACCESS_TOKEN', 'secret-token')
    const fetchFn = vi.fn(async () => okResponse([]))
    await postExpoMessages([], fetchFn as unknown as typeof fetch)
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-token')
  })
  it('throws on a non-2xx answer', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response)
    await expect(postExpoMessages([], fetchFn as unknown as typeof fetch)).rejects.toThrow('503')
  })
})
