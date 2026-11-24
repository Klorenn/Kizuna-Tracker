import { describe, expect, it } from 'vitest'
import { WIDGET_DEVICE_CAP, deviceMeta, formatPairingCode, isAndroidUserAgent } from '@/domain/widget-code'

describe('formatPairingCode', () => {
  it('ABCDEFGH -> ABCD-EFGH', () => expect(formatPairingCode('ABCDEFGH')).toBe('ABCD-EFGH'))
  it('ya con guion, minúsculas o espacios -> forma canónica', () => {
    expect(formatPairingCode('abcd-efgh')).toBe('ABCD-EFGH')
    expect(formatPairingCode(' ab cd efgh ')).toBe('ABCD-EFGH')
  })
  it('no inventa: otro largo se devuelve en mayúsculas sin partir', () => expect(formatPairingCode('abc')).toBe('ABC'))
})

describe('isAndroidUserAgent', () => {
  it('Chrome en Android', () =>
    expect(isAndroidUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36')).toBe(true))
  it.each(['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', '', null])('no: %s', (ua) =>
    expect(isAndroidUserAgent(ua as string | null)).toBe(false))
})

describe('cap', () => {
  it('3 dispositivos', () => expect(WIDGET_DEVICE_CAP).toBe(3))
})

describe('deviceMeta', () => {
  const now = new Date('2026-11-24T12:00:00Z')
  it('sin uso todavía', () => expect(deviceMeta('2026-11-20T10:00:00Z', null, now)).toBe('Conectado hace 4 días · sin uso todavía'))
  it('con último uso', () => expect(deviceMeta('2026-11-20T10:00:00Z', '2026-11-24T09:00:00Z', now)).toBe('Conectado hace 4 días · usado hace 3 horas'))
})
