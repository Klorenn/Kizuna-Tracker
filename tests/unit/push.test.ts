import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { sendPush, type PushDeps } from '@/lib/push'

const sub = (endpoint: string) => ({ endpoint, p256dh: 'p', auth: 'a' })
const payload = { title: 't', body: 'b', url: '/' }

function deps(over: Partial<PushDeps> = {}): PushDeps {
  return {
    listSubscriptions: vi.fn(async () => [sub('https://fcm.googleapis.com/fcm/send/1'), sub('https://fcm.googleapis.com/fcm/send/2')]),
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
        if (s.endpoint === 'https://fcm.googleapis.com/fcm/send/1') throw Object.assign(new Error('gone'), { statusCode: 410 })
      }),
    })
    await sendPush('u1', payload, d)
    expect(d.deleteSubscription).toHaveBeenCalledOnce()
    expect(d.deleteSubscription).toHaveBeenCalledWith('https://fcm.googleapis.com/fcm/send/1')
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
  it('never sends to an endpoint outside the push-service allow-list, and drops it', async () => {
    const d = deps({
      listSubscriptions: vi.fn(async () => [
        sub('http://169.254.169.254/latest/meta-data/'),
        sub('https://fcm.googleapis.com/fcm/send/ok'),
      ]),
    })
    await sendPush('u1', payload, d)
    expect(d.send).toHaveBeenCalledOnce()
    expect(d.send).toHaveBeenCalledWith(sub('https://fcm.googleapis.com/fcm/send/ok'), expect.any(String))
    expect(d.deleteSubscription).toHaveBeenCalledWith('http://169.254.169.254/latest/meta-data/')
  })
  it('limits how many sends run at once', async () => {
    let active = 0
    let peak = 0
    const many = Array.from({ length: 40 }, (_, i) => sub(`https://fcm.googleapis.com/fcm/send/${i}`))
    const d = deps({
      listSubscriptions: vi.fn(async () => many),
      send: vi.fn(async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 1))
        active--
      }),
    })
    await sendPush('u1', payload, d)
    expect(d.send).toHaveBeenCalledTimes(40)
    expect(peak).toBeLessThanOrEqual(10)
  })
})
