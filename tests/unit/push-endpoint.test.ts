import { describe, expect, it } from 'vitest'
import { parsePushSubscription } from '@/lib/push-endpoint'

const KEY65 = 'B' + 'A'.repeat(86) // 87 chars base64url (65 bytes)
const AUTH = 'A'.repeat(22) // 16 bytes
const body = (endpoint: string, over: Record<string, unknown> = {}) => ({
  endpoint,
  keys: { p256dh: KEY65, auth: AUTH, ...over },
})

describe('parsePushSubscription', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QWERTY',
    'https://api.push.apple.com/3/device/x',
    'https://db5p.notify.windows.com/?token=1',
    'https://wns2-par02p.notify.windows.com/w/?token=1',
  ])('accepts %s', (url) => {
    expect(parsePushSubscription(body(url))).toMatchObject({ ok: true, endpoint: url })
  })

  it.each([
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/x',
    'https://127.0.0.1/x',
    'https://localhost/x',
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://evil.example.com/fcm.googleapis.com',
    'https://fcm.googleapis.com.evil.com/x',
    'https://user:pass@fcm.googleapis.com/x',
    'https://evilnotify.windows.com/x',
    'not a url',
  ])('rejects %s', (url) => {
    expect(parsePushSubscription(body(url))).toEqual({ ok: false })
  })

  it('rejects malformed keys', () => {
    const ok = 'https://fcm.googleapis.com/fcm/send/abc'
    expect(parsePushSubscription(body(ok, { p256dh: 'short' }))).toEqual({ ok: false })
    expect(parsePushSubscription(body(ok, { auth: 'not base64url!!' + 'A'.repeat(8) }))).toEqual({ ok: false })
    expect(parsePushSubscription({ endpoint: ok })).toEqual({ ok: false })
    expect(parsePushSubscription(null)).toEqual({ ok: false })
  })
})
