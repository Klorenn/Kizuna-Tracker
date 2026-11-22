import { describe, expect, it, vi } from 'vitest'
import {
  celebrationFor,
  photoCheckin,
  sha256Hex,
  type PhotoCheckinDeps,
  type PhotoCheckinResult,
} from '@/lib/checkins'

const NOW = new Date('2026-11-24T02:30:00Z') // 23 nov 23:30 in Santiago
const UID = 'u1'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).buffer as ArrayBuffer
const file = (over: Partial<{ bytes: ArrayBuffer; type: string; size: number }> = {}) => ({
  bytes: JPEG,
  type: 'image/jpeg',
  size: JPEG.byteLength,
  ...over,
})

type Store = {
  profile: { timezone: string; deleted_at: string | null } | null
  habit: { id: string; user_id: string; requires_photo: boolean; archived_at: string | null } | null
  item: {
    id: string
    habit_id: string
    user_id: string
    requires_photo: boolean
    archived_at: string | null
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

  it('validates size and type', async () => {
    const { deps } = setup()
    expect(
      await photoCheckin(deps, UID, habit, file({ size: 5 * 1024 * 1024 + 1 }), NOW),
    ).toMatchObject({ status: 413 })
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
      item: { id: 'i1', habit_id: 'h1', user_id: UID, requires_photo: false, archived_at: null },
    })
    const r = await photoCheckin(deps, UID, { kind: 'item', itemId: 'i1' }, file(), NOW)
    expect(r).toMatchObject({ status: 200, created: true, dayCompleted: true })
    expect(inserted[0].path).toBe(`${UID}/items/${inserted[0].id}.jpg`)
    expect(deps.completeDay).toHaveBeenCalledWith('h1', UID, '2026-11-23')
  })

  it('reports an incomplete day for a non-last item', async () => {
    const { deps } = setup({
      dayCompleted: false,
      item: { id: 'i1', habit_id: 'h1', user_id: UID, requires_photo: true, archived_at: null },
    })
    expect(
      await photoCheckin(deps, UID, { kind: 'item', itemId: 'i1' }, file(), NOW),
    ).toMatchObject({ status: 200, dayCompleted: false })
  })

  it('rejects an archived or foreign item', async () => {
    const base = { id: 'i1', habit_id: 'h1', user_id: UID, requires_photo: true }
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

  it('deletes the row when the upload fails', async () => {
    const { deps, inserted } = setup({ uploadFails: true })
    const r = await photoCheckin(deps, UID, habit, file(), NOW)
    expect(r).toMatchObject({ status: 502 })
    expect(deps.deleteCheckin).toHaveBeenCalledWith(habit, inserted[0].id)
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
