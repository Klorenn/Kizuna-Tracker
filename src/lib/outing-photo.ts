import { stripJpegMetadata } from '@/lib/checkins'
import { PHOTO_NOT_JPEG, PHOTO_SAVE_ERROR } from '@/lib/photo-copy'

const MAX_OUTING_PHOTO_BYTES = 5 * 1024 * 1024

export type OutingPhotoDeps = {
  upload(path: string, bytes: ArrayBuffer): Promise<void>
  setPhoto(userId: string, outingId: string, path: string): Promise<void>
  remove?(path: string): Promise<void>
}

export type OutingPhotoResult = { status: 200 } | { status: 400 | 404 | 413 | 415 | 502; error: string }

/**
 * Stores one JPEG for an outing. Metadata segments are removed before upload.
 * Coordinates are never read from the file.
 */
export async function saveOutingPhoto(
  deps: OutingPhotoDeps,
  userId: string,
  outingId: string,
  file: { bytes: ArrayBuffer; type: string; size: number },
): Promise<OutingPhotoResult> {
  if (file.type !== 'image/jpeg') return { status: 415, error: PHOTO_NOT_JPEG }
  if (Math.max(file.size, file.bytes.byteLength) > MAX_OUTING_PHOTO_BYTES) {
    return { status: 413, error: 'La foto puede pesar hasta 5 MB.' }
  }
  const clean = stripJpegMetadata(file.bytes)
  if (!clean) return { status: 415, error: PHOTO_NOT_JPEG }
  const path = `${userId}/${outingId}.jpg`
  try {
    await deps.upload(path, clean)
  } catch {
    return { status: 502, error: PHOTO_SAVE_ERROR }
  }
  try {
    await deps.setPhoto(userId, outingId, path)
  } catch (error) {
    await deps.remove?.(path).catch(() => {})
    const message = error instanceof Error ? error.message : ''
    if (message.includes('not_found') || message.includes('not_authenticated')) {
      return { status: 404, error: 'No encontramos esa salida.' }
    }
    return { status: 502, error: PHOTO_SAVE_ERROR }
  }
  return { status: 200 }
}
