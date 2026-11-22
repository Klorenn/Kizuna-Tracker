import type { PresetKey } from '@/domain/presets'
import { localDate } from '@/domain/dates'

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export type PhotoTarget = { kind: 'habit'; habitId: string } | { kind: 'item'; itemId: string }

export type PhotoCheckinResult =
  | { status: 200; checkinId: string; created: boolean; isDuplicate: boolean; dayCompleted: boolean }
  | { status: 400 | 401 | 403 | 404 | 413 | 415 | 502; error: string }

type ErrorStatus = Exclude<PhotoCheckinResult['status'], 200>
const fail = (status: ErrorStatus, error: string): PhotoCheckinResult => ({ status, error })

export interface PhotoCheckinDeps {
  getProfile(userId: string): Promise<{ timezone: string; deleted_at: string | null } | null>
  getHabit(
    habitId: string,
  ): Promise<{ id: string; user_id: string; requires_photo: boolean; archived_at: string | null } | null>
  getItem(itemId: string): Promise<{
    id: string
    habit_id: string
    user_id: string
    requires_photo: boolean
    archived_at: string | null
  } | null>
  /** Today's row for the target, if any. */
  findCheckin(target: PhotoTarget, date: string): Promise<{ id: string } | null>
  /** Inserts the row with its final photo path; the DB trigger computes is_duplicate. */
  insertCheckin(
    target: PhotoTarget,
    row: { id: string; userId: string; habitId: string; localDate: string; path: string; sha256: string },
  ): Promise<{ isDuplicate: boolean }>
  deleteCheckin(target: PhotoTarget, id: string): Promise<void>
  upload(path: string, bytes: ArrayBuffer): Promise<void>
  /** Creates the habit's day check-in when every active item is checked (service role). */
  completeDay(habitId: string, userId: string, date: string): Promise<boolean>
}

const isJpeg = (b: ArrayBuffer) => {
  const v = new Uint8Array(b, 0, Math.min(3, b.byteLength))
  return v.length === 3 && v[0] === 0xff && v[1] === 0xd8 && v[2] === 0xff
}

export async function photoCheckin(
  deps: PhotoCheckinDeps,
  userId: string,
  target: PhotoTarget,
  file: { bytes: ArrayBuffer; type: string; size: number },
  now: Date,
): Promise<PhotoCheckinResult> {
  const profile = await deps.getProfile(userId)
  if (!profile || profile.deleted_at) return fail(403, 'No tienes acceso.')
  if (Math.max(file.size, file.bytes.byteLength) > MAX_PHOTO_BYTES) {
    return fail(413, 'La foto pesa demasiado. El máximo es 5 MB.')
  }
  if (file.type !== 'image/jpeg' || !isJpeg(file.bytes)) {
    return fail(415, 'La foto debe ser una imagen JPEG.')
  }

  let habitId: string
  let isItem = false
  if (target.kind === 'habit') {
    const habit = await deps.getHabit(target.habitId)
    if (!habit || habit.archived_at) return fail(404, 'No encontramos ese hábito.')
    if (habit.user_id !== userId) return fail(403, 'No tienes acceso.')
    if (!habit.requires_photo) return fail(400, 'Este hábito no pide foto.')
    habitId = habit.id
  } else {
    const item = await deps.getItem(target.itemId)
    if (!item || item.archived_at) return fail(404, 'No encontramos ese paso.')
    if (item.user_id !== userId) return fail(403, 'No tienes acceso.')
    habitId = item.habit_id
    isItem = true
  }

  const date = localDate(now, profile.timezone)
  const existing = await deps.findCheckin(target, date)
  if (existing) {
    return {
      status: 200,
      checkinId: existing.id,
      created: false,
      isDuplicate: false,
      dayCompleted: isItem ? await deps.completeDay(habitId, userId, date) : true,
    }
  }

  const id = crypto.randomUUID()
  const path = isItem ? `${userId}/items/${id}.jpg` : `${userId}/${id}.jpg`
  const sha256 = await sha256Hex(file.bytes)
  let isDuplicate: boolean
  try {
    ;({ isDuplicate } = await deps.insertCheckin(target, { id, userId, habitId, localDate: date, path, sha256 }))
  } catch {
    // lost a race with a parallel request: the other row wins
    const raced = await deps.findCheckin(target, date)
    if (raced) {
      return {
        status: 200,
        checkinId: raced.id,
        created: false,
        isDuplicate: false,
        dayCompleted: isItem ? await deps.completeDay(habitId, userId, date) : true,
      }
    }
    return fail(502, 'No pudimos guardar la foto. Inténtalo de nuevo.')
  }
  try {
    await deps.upload(path, file.bytes)
  } catch {
    await deps.deleteCheckin(target, id).catch(() => {})
    return fail(502, 'No pudimos guardar la foto. Inténtalo de nuevo.')
  }
  return {
    status: 200,
    checkinId: id,
    created: true,
    isDuplicate,
    dayCompleted: isItem ? await deps.completeDay(habitId, userId, date) : true,
  }
}

/** The workout celebration shows only for a new Gym check-in. */
export function celebrationFor(
  habit: { preset: PresetKey | null },
  result: PhotoCheckinResult,
): 'workout' | null {
  return result.status === 200 && result.created && habit.preset === 'gym' ? 'workout' : null
}
