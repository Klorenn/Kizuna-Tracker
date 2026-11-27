import { describe, expect, test, vi } from 'vitest'
import { saveOutingPhoto, type OutingPhotoDeps } from '@/lib/outing-photo'

// Same JPEG shape as tests/unit/checkins.test.ts: JFIF stays, APP1 is stripped.
const seg = (m: number, body: number[]) => [0xff, m, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body]
const EXIF = [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0, 9, 9, 9])
const JFIF = [...'JFIF'].map((c) => c.charCodeAt(0)).concat([0, 1, 1, 0, 0, 1, 0, 1, 0, 0])
const SOS_DATA = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]
const jpeg = (...segments: number[][]) =>
  new Uint8Array([0xff, 0xd8, ...segments.flat(), ...seg(0xda, [1, 1, 0, 0, 63, 0]), ...SOS_DATA, 0xff, 0xd9])
    .buffer as ArrayBuffer
const CLEAN = jpeg(seg(0xe0, JFIF))
const WITH_APP1 = jpeg(seg(0xe0, JFIF), seg(0xe1, EXIF))
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('')

const userId = '6b0e0c6a-3e3e-4e3e-8e3e-3e3e3e3e3e3e'
const outingId = '7b0e0c6a-3e3e-4e3e-8e3e-3e3e3e3e3e3e'

function deps() {
  const upload = vi.fn(async (_path: string, _bytes: ArrayBuffer) => {})
  const setPhoto = vi.fn(async () => {})
  const d: OutingPhotoDeps = { upload, setPhoto }
  return { d, upload, setPhoto }
}

describe('foto de salida', () => {
  test('un JPEG con APP1 se guarda sin ese segmento', async () => {
    const { d, upload, setPhoto } = deps()
    const result = await saveOutingPhoto(d, userId, outingId, {
      bytes: WITH_APP1,
      type: 'image/jpeg',
      size: WITH_APP1.byteLength,
    })
    expect(result).toEqual({ status: 200 })
    expect(upload).toHaveBeenCalledOnce()
    const [path, bytes] = upload.mock.calls[0]!
    expect(path).toBe(`${userId}/${outingId}.jpg`)
    expect(hex(bytes)).toBe(hex(CLEAN))
    expect(hex(bytes)).not.toContain(hex(new Uint8Array(EXIF).buffer))
    expect(setPhoto).toHaveBeenCalledWith(userId, outingId, `${userId}/${outingId}.jpg`)
  })

  test('un archivo que no es JPEG no llama a upload', async () => {
    const { d, upload, setPhoto } = deps()
    const result = await saveOutingPhoto(d, userId, outingId, {
      bytes: WITH_APP1,
      type: 'image/png',
      size: WITH_APP1.byteLength,
    })
    expect(result.status).toBe(415)
    expect(upload).not.toHaveBeenCalled()
    expect(setPhoto).not.toHaveBeenCalled()
  })
})
