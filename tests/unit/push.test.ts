import { describe, expect, it, vi } from 'vitest'
import { sendPush, type PushDeps } from '@/lib/push'

const sub = (endpoint: string) => ({ endpoint, p256dh: 'p', auth: 'a' })
const payload = { title: 't', body: 'b', url: '/' }

function deps(over: Partial<PushDeps> = {}): PushDeps {
  return {
    listSubscriptions: vi.fn(async () => [sub('https://push/1'), sub('https://push/2')]),
    deleteSubscription: vi.fn(async () => {}),
    send: vi.fn(async () => {}),
    ...over,
  }
}

describe('sendPush', () => {
  it('sends to every subscription of the user', async () => {
    const d = deps()
    await sendPush('u1', payload, d)
    expect(d.send).toHaveBeenCalledTimes(2)
    expect(d.deleteSubscription).not.toHaveBeenCalled()
  })
  it('deletes a subscription that answers 410', async () => {
    const d = deps({
      send: vi.fn(async (s) => {
        if (s.endpoint === 'https://push/1') throw Object.assign(new Error('gone'), { statusCode: 410 })
      }),
    })
    await sendPush('u1', payload, d)
    expect(d.deleteSubscription).toHaveBeenCalledOnce()
    expect(d.deleteSubscription).toHaveBeenCalledWith('https://push/1')
  })
  it('deletes a subscription that answers 404', async () => {
    const d = deps({ send: vi.fn(async () => { throw Object.assign(new Error('nf'), { statusCode: 404 }) }) })
    await sendPush('u1', payload, d)
    expect(d.deleteSubscription).toHaveBeenCalledTimes(2)
  })
  it('keeps the subscription and does not throw on other errors', async () => {
    const d = deps({ send: vi.fn(async () => { throw Object.assign(new Error('boom'), { statusCode: 500 }) }) })
    await expect(sendPush('u1', payload, d)).resolves.toBeUndefined()
    expect(d.deleteSubscription).not.toHaveBeenCalled()
  })
})
