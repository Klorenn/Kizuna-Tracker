import { describe, expect, test } from 'vitest'
import { MAX_AVATAR_BYTES, processAvatar } from '@/lib/avatar'

// SOI, APP1 (EXIF, dropped), SOS with 2 bytes of scan data, EOI
const withExif = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66, 0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9,
]).buffer as ArrayBuffer

describe('processAvatar', () => {
  test('rechaza lo que no es image/jpeg', () => {
    expect(processAvatar(withExif, 'image/png').ok).toBe(false)
  })
  test('rechaza bytes que no son un JPEG válido', () => {
    expect(processAvatar(new Uint8Array([1, 2, 3, 4, 5]).buffer as ArrayBuffer, 'image/jpeg').ok).toBe(false)
  })
  test('quita EXIF', () => {
    const r = processAvatar(withExif, 'image/jpeg')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const s = Array.from(new Uint8Array(r.bytes))
      expect(s.includes(0xe1)).toBe(false)
      expect(r.bytes.byteLength).toBeLessThan(withExif.byteLength)
    }
  })
  test('rechaza sobre 1 MB', () => {
    const big = new Uint8Array(MAX_AVATAR_BYTES + 10)
    big.set([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02], 0)
    big.fill(0x11, 6)
    big.set([0xff, 0xd9], big.length - 2)
    expect(processAvatar(big.buffer as ArrayBuffer, 'image/jpeg')).toEqual({
      ok: false,
      error: 'La foto pesa demasiado. El máximo es 1 MB.',
    })
  })
})
