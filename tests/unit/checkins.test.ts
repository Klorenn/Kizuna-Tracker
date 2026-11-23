import { describe, expect, it, vi } from 'vitest'
import {
  celebrationFor,
  contentLengthError,
  MAX_PHOTO_BYTES,
  stripJpegMetadata,
  photoCheckin,
  sha256Hex,
  type PhotoCheckinDeps,
  type PhotoCheckinResult,
} from '@/lib/checkins'

const NOW = new Date('2026-11-24T02:30:00Z') // 23 nov 23:30 in Santiago
const UID = 'u1'
const seg = (m: number, body: number[]) => [0xff, m, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body]
const EXIF = [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0, 9, 9, 9])
const JFIF = [...'JFIF'].map((c) => c.charCodeAt(0)).concat([0, 1, 1, 0, 0, 1, 0, 1, 0, 0])
const SOS_DATA = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56] // stuffed zero and a restart marker
const jpeg = (...segments: number[][]) =>
  new Uint8Array([0xff, 0xd8, ...segments.flat(), ...seg(0xda, [1, 1, 0, 0, 63, 0]), ...SOS_DATA, 0xff, 0xd9])
    .buffer as ArrayBuffer
const JPEG = jpeg(seg(0xe0, JFIF))
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('')
const file = (over: Partial<{ bytes: ArrayBuffer; type: string; size: number }> = {}) => ({
  bytes: JPEG,
  type: 'image/jpeg',
  size: JPEG.byteLength,
  ...over,
})

type Store = {
  profile: { timezone: string; deleted_at: string | null } | null
  habit: { id: string; user_id: string; requires_photo: boolean; archived_at: string | null; log_type?: string } | null
  item: {
    id: string
    habit_id: string
    user_id: string
    requires_photo: boolean
    archived_at: string | null
    habit_user_id: string
    habit_archived_at: string | null
    habit_requires_photo: boolean
  } | null
  existing: { id: string } | null
  duplicate: boolean
  uploadFails: boolean
  dayCompleted: boolean
}

function setup(over: Partial<Store> = {}) {
  const s: Store = {
    profile: { timezone: 'America/Santiago', deleted_at: null },
    habit: { id: 'h1', user_id: UID, requires_photo: true, archived_at: null },
    item: null,
    existing: null,
    duplicate: false,
    uploadFails: false,
    dayCompleted: true,
    ...over,
  }
  const inserted: { id: string; localDate: string; path: string; sha256: string }[] = []
  const deps: PhotoCheckinDeps = {
    getProfile: vi.fn(async () => s.profile),
    getHabit: vi.fn(async () => s.habit),
    getItem: vi.fn(async () => s.item),
    findCheckin: vi.fn(async () => s.existing),
    insertCheckin: vi.fn(async (_t, row) => {
      inserted.push({ id: row.id, localDate: row.localDate, path: row.path, sha256: row.sha256 })
      return { isDuplicate: s.duplicate }
    }),
    deleteCheckin: vi.fn(async () => {}),
    upload: vi.fn(async () => {
      if (s.uploadFails) throw new Error('boom')
    }),
    completeDay: vi.fn(async () => s.dayCompleted),
  }
  return { deps, inserted, s }
}

describe('sha256Hex', () => {
  it('hashes bytes', async () => {
    expect(await sha256Hex(new TextEncoder().encode('kizuna').buffer as ArrayBuffer)).toBe(
      'a57723ea2187016632c8ca63d3a8df2df0c7c46fbdc3d850560810625c9162f5',
    )
  })
})

describe('photoCheckin', () => {
  const habit = { kind: 'habit', habitId: 'h1' } as const

  it('creates a habit check-in with the profile local date', async () => {
    const { deps, inserted } = setup()
    const r = await photoCheckin(deps, UID, habit, file(), NOW)
    expect(r).toMatchObject({ status: 200, created: true, isDuplicate: false, dayCompleted: true })
    expect(inserted[0].localDate).toBe('2026-11-23')
    expect(inserted[0].path).toBe(`${UID}/${inserted[0].id}.jpg`)
    expect(inserted[0].sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(deps.upload).toHaveBeenCalledWith(inserted[0].path, JPEG)
  })

  it('is idempotent for the same day', async () => {
    const { deps } = setup({ existing: { id: 'c9' } })
    const r = await photoCheckin(deps, UID, habit, file(), NOW)
    expect(r).toMatchObject({ status: 200, created: false, checkinId: 'c9' })
    expect(deps.upload).not.toHaveBeenCalled()
    expect(deps.insertCheckin).not.toHaveBeenCalled()
  })

  it('flags a repeated image', async () => {
    const { deps } = setup({ duplicate: true })
    expect(await photoCheckin(deps, UID, habit, file(), NOW)).toMatchObject({
      status: 200,
      isDuplicate: true,
    })
  })

  it('rejects someone else habit, missing habit and deleted profile', async () => {
    expect(
      await photoCheckin(
        setup({ habit: { id: 'h1', user_id: 'other', requires_photo: true, archived_at: null } }).deps,
        UID, habit, file(), NOW,
      ),
    ).toMatchObject({ status: 403 })
    expect(await photoCheckin(setup({ habit: null }).deps, UID, habit, file(), NOW)).toMatchObject({
      status: 404,
    })
    expect(
      await photoCheckin(
        setup({ profile: { timezone: 'UTC', deleted_at: '2026-01-01' } }).deps,
        UID, habit, file(), NOW,
      ),
    ).toMatchObject({ status: 403 })
    expect(await photoCheckin(setup({ profile: null }).deps, UID, habit, file(), NOW)).toMatchObject({
      status: 403,
    })
  })

  it('refuses a quantity habit before storing anything', async () => {
    const { deps } = setup({
      habit: { id: 'h1', user_id: UID, requires_photo: false, archived_at: null, log_type: 'quantity' },
    })
    expect(await photoCheckin(deps, UID, habit, file(), NOW)).toEqual({
      status: 400,
      error: 'Un hábito de cantidad no lleva foto: suma la cantidad desde Hoy.',
    })
    expect(deps.insertCheckin).not.toHaveBeenCalled()
    expect(deps.upload).not.toHaveBeenCalled()
  })

  it('validates size and type', async () => {
    const { deps } = setup()
    // Vercel rejects bodies over 4.5 MB: the accepted photo is 4 MB at most
    expect(MAX_PHOTO_BYTES).toBe(4 * 1024 * 1024)
    expect(await photoCheckin(deps, UID, habit, file({ size: 4 * 1024 * 1024 + 1 }), NOW)).toEqual({
      status: 413,
      error: 'La foto pesa demasiado. Prueba con otra o toma una nueva.',
    })
    expect(await photoCheckin(deps, UID, habit, file({ size: 4 * 1024 * 1024 }), NOW)).toMatchObject({ status: 200 })
    expect(await photoCheckin(deps, UID, habit, file({ type: 'image/png' }), NOW)).toMatchObject({
      status: 415,
    })
    const notJpeg = new Uint8Array([1, 2, 3, 4]).buffer as ArrayBuffer
    expect(await photoCheckin(deps, UID, habit, file({ bytes: notJpeg }), NOW)).toMatchObject({
      status: 415,
    })
  })

  it('refuses a habit that does not ask for a photo', async () => {
    const { deps } = setup({
      habit: { id: 'h1', user_id: UID, requires_photo: false, archived_at: null },
    })
    expect(await photoCheckin(deps, UID, habit, file(), NOW)).toEqual({
      status: 400,
      error: 'Este hábito no pide foto.',
    })
  })

  it('stores an item proof under items/ and completes the day', async () => {
    const { deps, inserted } = setup({
      item: { id: 'i1', habit_id: 'h1', user_id: UID, requires_photo: false, archived_at: null, habit_user_id: UID, habit_archived_at: null, habit_requires_photo: false },
    })
    const r = await photoCheckin(deps, UID, { kind: 'item', itemId: 'i1' }, file(), NOW)
    expect(r).toMatchObject({ status: 200, created: true, dayCompleted: true })
    expect(inserted[0].path).toBe(`${UID}/items/${inserted[0].id}.jpg`)
    expect(deps.completeDay).toHaveBeenCalledWith('h1', UID, '2026-11-23')
  })

  it('reports an incomplete day for a non-last item', async () => {
    const { deps } = setup({
      dayCompleted: false,
      item: { id: 'i1', habit_id: 'h1', user_id: UID, requires_photo: true, archived_at: null, habit_user_id: UID, habit_archived_at: null, habit_requires_photo: false },
    })
    expect(
      await photoCheckin(deps, UID, { kind: 'item', itemId: 'i1' }, file(), NOW),
    ).toMatchObject({ status: 200, dayCompleted: false })
  })

  it('rejects an archived or foreign item', async () => {
    const base = { id: 'i1', habit_id: 'h1', user_id: UID, requires_photo: true, habit_user_id: UID, habit_archived_at: null, habit_requires_photo: false }
    expect(
      await photoCheckin(
        setup({ item: { ...base, archived_at: 'x' } }).deps,
        UID, { kind: 'item', itemId: 'i1' }, file(), NOW,
      ),
    ).toMatchObject({ status: 404 })
    expect(
      await photoCheckin(
        setup({ item: { ...base, user_id: 'other', archived_at: null } }).deps,
        UID, { kind: 'item', itemId: 'i1' }, file(), NOW,
      ),
    ).toMatchObject({ status: 403 })
  })

  it('refuses a step of a habit that asks for a photo: only a habit photo can complete that day', async () => {
    const { deps } = setup({
      item: {
        id: 'i1', habit_id: 'h1', user_id: UID, requires_photo: false, archived_at: null,
        habit_user_id: UID, habit_archived_at: null, habit_requires_photo: true,
      },
    })
    expect(await photoCheckin(deps, UID, { kind: 'item', itemId: 'i1' }, file(), NOW)).toMatchObject({ status: 400 })
    expect(deps.insertCheckin).not.toHaveBeenCalled()
    expect(deps.upload).not.toHaveBeenCalled()
    expect(deps.completeDay).not.toHaveBeenCalled()
  })

  it('rejects an item whose parent habit is archived or foreign', async () => {
    const base = { id: 'i1', habit_id: 'h1', user_id: UID, requires_photo: true, archived_at: null }
    const t = { kind: 'item', itemId: 'i1' } as const
    expect(
      await photoCheckin(
        setup({ item: { ...base, habit_user_id: UID, habit_archived_at: '2026-11-01', habit_requires_photo: false } }).deps,
        UID, t, file(), NOW,
      ),
    ).toMatchObject({ status: 404 })
    expect(
      await photoCheckin(
        setup({ item: { ...base, habit_user_id: 'other', habit_archived_at: null, habit_requires_photo: false } }).deps,
        UID, t, file(), NOW,
      ),
    ).toMatchObject({ status: 403 })
  })

  it('stores and hashes the stripped bytes, never the EXIF', async () => {
    const withExif = jpeg(seg(0xe0, JFIF), seg(0xe1, EXIF), seg(0xfe, [104, 105]))
    const { deps, inserted } = setup()
    await photoCheckin(deps, UID, habit, file({ bytes: withExif, size: withExif.byteLength }), NOW)
    const stored = vi.mocked(deps.upload).mock.calls[0][1]
    expect(hex(stored)).not.toContain('45786966') // "Exif"
    expect(hex(stored)).toBe(hex(JPEG))
    expect(inserted[0].sha256).toBe(await sha256Hex(JPEG))
  })

  it('reports an open day when completeDay fails after the photo is stored', async () => {
    const { deps } = setup({
      item: { id: 'i1', habit_id: 'h1', user_id: UID, requires_photo: true, archived_at: null, habit_user_id: UID, habit_archived_at: null, habit_requires_photo: false },
    })
    vi.mocked(deps.completeDay).mockRejectedValueOnce(new Error('rpc'))
    expect(
      await photoCheckin(deps, UID, { kind: 'item', itemId: 'i1' }, file(), NOW),
    ).toMatchObject({ status: 200, created: true, dayCompleted: false })
  })

  it('turns an unexpected dependency failure into 502', async () => {
    const { deps } = setup()
    vi.mocked(deps.getProfile).mockRejectedValueOnce(new Error('db down'))
    expect(await photoCheckin(deps, UID, habit, file(), NOW)).toEqual({
      status: 502,
      error: 'No pudimos guardar la foto. Inténtalo de nuevo.',
    })
  })

  it('deletes the row when the upload fails', async () => {
    const { deps, inserted } = setup({ uploadFails: true })
    const r = await photoCheckin(deps, UID, habit, file(), NOW)
    expect(r).toMatchObject({ status: 502 })
    expect(deps.deleteCheckin).toHaveBeenCalledWith(habit, inserted[0].id)
  })
})

describe('stripJpegMetadata', () => {
  it('drops APP1-15 and COM, keeps JFIF and scan data', () => {
    const out = stripJpegMetadata(jpeg(seg(0xe0, JFIF), seg(0xe1, EXIF), seg(0xed, [1, 2]), seg(0xfe, [65])))!
    expect(hex(out)).toBe(hex(JPEG))
  })
  it('rejects malformed structure', () => {
    const bad = (a: number[]) => stripJpegMetadata(new Uint8Array(a).buffer as ArrayBuffer)
    expect(bad([1, 2, 3, 4])).toBeNull()
    expect(bad([0xff, 0xd8, 0xff, 0xd9])).toBeNull() // no scan
    expect(stripJpegMetadata(JPEG.slice(0, JPEG.byteLength - 2))).toBeNull() // no EOI
    const trailing = new Uint8Array([...new Uint8Array(JPEG), 1, 2, 3]).buffer as ArrayBuffer
    expect(stripJpegMetadata(trailing)).toBeNull() // polyglot tail
    expect(bad([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x40, 1, 2])).toBeNull() // length past end
  })
  it('photoCheckin answers 415 for it', async () => {
    const { deps } = setup()
    const junk = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).buffer as ArrayBuffer
    expect(
      await photoCheckin(deps, UID, { kind: 'habit', habitId: 'h1' }, file({ bytes: junk }), NOW),
    ).toMatchObject({ status: 415 })
  })
})

describe('contentLengthError', () => {
  it('requires a valid, bounded Content-Length', () => {
    expect(contentLengthError(null)).toMatchObject({ status: 411 })
    expect(contentLengthError('abc')).toMatchObject({ status: 411 })
    expect(contentLengthError(String(6 * 1024 * 1024))).toEqual({
      status: 413,
      error: 'La foto pesa demasiado. Prueba con otra o toma una nueva.',
    })
    expect(contentLengthError(String(4.5 * 1024 * 1024))).toMatchObject({ status: 413 })
    expect(contentLengthError('1000')).toBeNull()
  })
})

describe('celebrationFor', () => {
  const ok = (created: boolean): PhotoCheckinResult => ({
    status: 200,
    checkinId: 'c',
    created,
    isDuplicate: false,
    dayCompleted: true,
  })
  it('celebrates only a new gym check-in', () => {
    expect(celebrationFor({ preset: 'gym' }, ok(true))).toBe('workout')
    expect(celebrationFor({ preset: 'gym' }, ok(false))).toBeNull()
    expect(celebrationFor({ preset: 'read' }, ok(true))).toBeNull()
    expect(celebrationFor({ preset: null }, ok(true))).toBeNull()
    expect(celebrationFor({ preset: 'gym' }, { status: 403, error: 'x' })).toBeNull()
  })
})
