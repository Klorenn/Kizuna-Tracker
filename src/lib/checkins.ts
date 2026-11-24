import type { PresetKey } from '@/domain/presets'
import { localDate } from '@/domain/dates'
import { MAX_PHOTO_BYTES, PHOTO_NOT_JPEG, PHOTO_SAVE_ERROR, PHOTO_TARGET_MB, PHOTO_TOO_BIG } from '@/lib/photo-copy'

export { MAX_PHOTO_BYTES, PHOTO_TARGET_MB }
const TOO_BIG = PHOTO_TOO_BIG

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export type PhotoTarget = { kind: 'habit'; habitId: string } | { kind: 'item'; itemId: string }

export type PhotoCheckinResult =
  | { status: 200; checkinId: string; created: boolean; isDuplicate: boolean; dayCompleted: boolean }
  | { status: 400 | 401 | 403 | 404 | 411 | 413 | 415 | 502; error: string }

type ErrorStatus = Exclude<PhotoCheckinResult['status'], 200>
const fail = (status: ErrorStatus, error: string): PhotoCheckinResult => ({ status, error })

export interface PhotoCheckinDeps {
  getProfile(userId: string): Promise<{ timezone: string; deleted_at: string | null } | null>
  getHabit(
    habitId: string,
  ): Promise<{
    id: string
    user_id: string
    requires_photo: boolean
    archived_at: string | null
    log_type?: string
  } | null>
  getItem(itemId: string): Promise<{
    id: string
    habit_id: string
    user_id: string
    requires_photo: boolean
    archived_at: string | null
    /** the parent habit (check_item requires it to be active) */
    habit_user_id: string
    habit_archived_at: string | null
    /** a photo habit is completed only by its own photo check-in, never through steps */
    habit_requires_photo: boolean
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

/**
 * Walks the JPEG segments from SOI to EOI and returns a copy without metadata
 * (APP1-APP15 such as EXIF/XMP, and COM). APP0/JFIF is kept. Returns null when the
 * structure is not a well-formed JPEG (bad markers or lengths, no scan, data after EOI).
 */
export function stripJpegMetadata(input: ArrayBuffer): ArrayBuffer | null {
  const b = new Uint8Array(input)
  const n = b.length
  if (n < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  const out: number[][] = [[0xff, 0xd8]]
  let i = 2
  let sawScan = false
  while (i < n) {
    if (b[i] !== 0xff) return null
    while (i < n && b[i] === 0xff) i++ // fill bytes
    if (i >= n) return null
    const m = b[i++]
    if (m === 0xd9) {
      // EOI: must close a scan and be the last bytes
      return sawScan && i === n ? concat(out, [[0xff, 0xd9]]) : null
    }
    if (m === 0x00 || m === 0x01 || m === 0xd8 || (m >= 0xd0 && m <= 0xd7)) return null
    if (i + 2 > n) return null
    const len = (b[i] << 8) | b[i + 1]
    if (len < 2 || i + len > n) return null
    const keep = !((m >= 0xe1 && m <= 0xef) || m === 0xfe)
    if (keep) out.push([0xff, m, ...b.subarray(i, i + len)])
    i += len
    if (m === 0xda) {
      sawScan = true
      // entropy-coded data: runs until the next real marker (FF followed by not 00/RSTn)
      const start = i
      while (i < n) {
        if (b[i] === 0xff) {
          let j = i + 1
          while (j < n && b[j] === 0xff) j++
          if (j >= n) return null
          const next = b[j]
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
            i = j + 1
            continue
          }
          i = j - 1 // position on the 0xFF of the marker; the outer loop reads it
          break
        }
        i++
      }
      out.push(Array.from(b.subarray(start, i)))
    }
  }
  return null
}

function concat(parts: number[][], tail: number[][]): ArrayBuffer {
  const all = [...parts, ...tail]
  const total = all.reduce((a, p) => a + p.length, 0)
  const res = new Uint8Array(total)
  let o = 0
  for (const p of all) {
    res.set(p, o)
    o += p.length
  }
  return res.buffer as ArrayBuffer
}

const SAVE_ERROR = PHOTO_SAVE_ERROR

/** Rejects requests with a missing or oversized Content-Length before the body is read. */
export function contentLengthError(header: string | null): PhotoCheckinResult | null {
  if (header === null || !/^\d+$/.test(header)) return fail(411, 'La solicitud no es válida.')
  if (Number(header) > MAX_PHOTO_BYTES + 64 * 1024) {
    return fail(413, TOO_BIG)
  }
  return null
}

async function run(
  deps: PhotoCheckinDeps,
  userId: string,
  target: PhotoTarget,
  file: { bytes: ArrayBuffer; type: string; size: number },
  now: Date,
): Promise<PhotoCheckinResult> {
  const profile = await deps.getProfile(userId)
  if (!profile || profile.deleted_at) return fail(403, 'No tienes acceso.')
  if (Math.max(file.size, file.bytes.byteLength) > MAX_PHOTO_BYTES) {
    return fail(413, TOO_BIG)
  }
  if (file.type !== 'image/jpeg') return fail(415, PHOTO_NOT_JPEG)
  // never trust the client: drop EXIF/XMP/comments and validate the structure server-side
  const clean = stripJpegMetadata(file.bytes)
  if (!clean) return fail(415, PHOTO_NOT_JPEG)

  let habitId: string
  let isItem = false
  if (target.kind === 'habit') {
    const habit = await deps.getHabit(target.habitId)
    if (!habit || habit.archived_at) return fail(404, 'No encontramos ese hábito.')
    if (habit.user_id !== userId) return fail(403, 'No tienes acceso.')
    // the database refuses it too (`quantity_habit`); answer before storing anything
    if (habit.log_type === 'quantity') return fail(400, 'Un hábito de cantidad no lleva foto: suma la cantidad desde Hoy.')
    if (!habit.requires_photo) return fail(400, 'Este hábito no pide foto.')
    habitId = habit.id
  } else {
    const item = await deps.getItem(target.itemId)
    if (!item || item.archived_at || item.habit_archived_at) return fail(404, 'No encontramos ese paso.')
    if (item.user_id !== userId || item.habit_user_id !== userId) return fail(403, 'No tienes acceso.')
    if (item.habit_requires_photo) return fail(400, 'Este hábito pide la foto en el hábito, no en sus pasos.')
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
      dayCompleted: isItem ? await safeComplete(deps, habitId, userId, date) : true,
    }
  }

  const id = crypto.randomUUID()
  const path = isItem ? `${userId}/items/${id}.jpg` : `${userId}/${id}.jpg`
  const sha256 = await sha256Hex(clean)
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
        dayCompleted: isItem ? await safeComplete(deps, habitId, userId, date) : true,
      }
    }
    return fail(502, SAVE_ERROR)
  }
  try {
    await deps.upload(path, clean)
  } catch {
    await deps.deleteCheckin(target, id).catch(() => {})
    return fail(502, SAVE_ERROR)
  }
  return {
    status: 200,
    checkinId: id,
    created: true,
    isDuplicate,
    dayCompleted: isItem ? await safeComplete(deps, habitId, userId, date) : true,
  }
}

/** The workout celebration shows only for a new Gym check-in. */
export function celebrationFor(
  habit: { preset: PresetKey | null },
  result: PhotoCheckinResult,
): 'workout' | null {
  return result.status === 200 && result.created && habit.preset === 'gym' ? 'workout' : null
}

/** A failed day-completion lookup must not lose a stored photo: report the day as open. */
async function safeComplete(deps: PhotoCheckinDeps, habitId: string, userId: string, date: string) {
  try {
    return await deps.completeDay(habitId, userId, date)
  } catch {
    return false
  }
}

export async function photoCheckin(
  deps: PhotoCheckinDeps,
  userId: string,
  target: PhotoTarget,
  file: { bytes: ArrayBuffer; type: string; size: number },
  now: Date,
): Promise<PhotoCheckinResult> {
  try {
    return await run(deps, userId, target, file, now)
  } catch {
    return fail(502, SAVE_ERROR)
  }
}
