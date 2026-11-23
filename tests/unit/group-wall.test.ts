import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const signed: Record<string, string | null | undefined> = {}
vi.mock('@/lib/use-signed-urls', () => ({ useSignedUrls: () => signed }))

const { WallFeed, WallChunk, fetchMoreWall } = await import('@/components/groups/detail/WallFeed')
import type { GroupWallItem, GroupWallPage } from '@/lib/groups-contract'

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const item = (id: string, over: Partial<GroupWallItem> = {}): GroupWallItem => ({
  userId: 'u-ana',
  username: 'ana',
  displayName: 'Ana',
  avatarPath: null,
  avatarPreset: null,
  checkinId: id,
  localDate: '2026-11-23',
  photoPath: null,
  createdAt: '2026-11-23T10:41:00Z',
  ...over,
})
const loadMoreWall = vi.fn()
const render = (wall: GroupWallPage | null, today = '2026-11-23') =>
  renderToStaticMarkup(createElement(WallFeed, { groupId: 'g1', wall, today, actions: { loadMoreWall }, retryHref: '/grupos/g1', color: 'oliva' }))

describe('WallFeed', () => {
  it('failed read: a retry line, not an empty wall', () => {
    expect(text(render(null))).toContain('No pudimos cargar esto')
  })

  it('empty: the binding empty state and no "Ver más"', () => {
    const h = render({ items: [], next: null })
    expect(text(h)).toContain('Aún no hay registros en este grupo.')
    expect(text(h)).not.toContain('Ver más')
  })

  it('groups by day with the shared day labels', () => {
    const h = render({ items: [item('1'), item('2', { localDate: '2026-11-22' }), item('3', { localDate: '2026-11-19' })], next: null })
    expect(text(h)).toContain('Hoy')
    expect(text(h)).toContain('Ayer')
    expect(text(h)).toContain('Jue 19 nov')
    expect(h.match(/<section/g)).toHaveLength(3)
  })

  it('a photo check-in: lazy image from its signed URL, alt text, the name over it', () => {
    signed['g/a.jpg'] = 'https://signed.test/a.jpg'
    const h = render({ items: [item('1', { photoPath: 'g/a.jpg' })], next: null })
    expect(h).toContain('src="https://signed.test/a.jpg"')
    expect(h).toContain('loading="lazy"')
    expect(h).toContain('alt="Foto de Ana"')
    expect(text(h)).toContain('Subió su foto')
    delete signed['g/a.jpg']
  })

  it('a photo that is still signing keeps its place; one that cannot be signed says so', () => {
    const loading = render({ items: [item('1', { photoPath: 'g/b.jpg' })], next: null })
    expect(loading).toContain('aria-busy="true"')
    expect(loading).not.toContain('<img src="undefined"')
    signed['g/b.jpg'] = null
    const failed = render({ items: [item('1', { photoPath: 'g/b.jpg' })], next: null })
    expect(text(failed)).toContain('Foto no disponible')
    delete signed['g/b.jpg']
  })

  it('a check-in without a photo is a text row, with no image', () => {
    const h = render({ items: [item('1')], next: null })
    expect(text(h)).toContain('Registró')
    expect(h).not.toContain('<img src=')
    expect(h).toContain('href="/@ana"')
  })

  it('shows only name, @usuario, avatar, date and photo (not the creation time or other fields)', () => {
    const leaky = { ...item('1'), email: 'a@secret.test', habitName: 'Secreto', note: 'nota' } as GroupWallItem
    const h = render({ items: [leaky], next: null })
    for (const s of ['secret.test', 'Secreto', 'nota', '10:41', '2026-11-23T']) expect(h).not.toContain(s)
  })

  it('"Ver más" only while there is a next page', () => {
    expect(text(render({ items: [item('1')], next: { before: 'x', beforeId: '1' } }))).toContain('Ver más')
    expect(text(render({ items: [item('1')], next: null }))).not.toContain('Ver más')
  })

  it('every loaded page is a memoized chunk, so a new page does not re-render the old ones', () => {
    expect((WallChunk as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'))
  })

  it('long names truncate in one line', () => {
    const h = render({ items: [item('1', { displayName: 'N'.repeat(80) })], next: null })
    expect(h).toContain('truncate')
  })
})

describe('fetchMoreWall', () => {
  const cursor = { before: '2026-11-20T00:00:00Z', beforeId: '2' }
  const start = { pages: [[item('1'), item('2')]], next: cursor, error: null }

  it('asks the action with the cursor and appends the page without repeating rows', async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true, data: { items: [item('2'), item('3')], next: null } })
    const out = await fetchMoreWall(start, 'g1', fn)
    expect(fn).toHaveBeenCalledWith('g1', cursor)
    expect(out.pages.map((p) => p.map((i) => i.checkinId))).toEqual([['1', '2'], ['3']])
    expect(out.next).toBeNull()
  })

  it('a failed result keeps what is on screen and the cursor, and carries the error', async () => {
    const fn = vi.fn().mockResolvedValue({ ok: false, error: 'No encontramos ese grupo.' })
    const out = await fetchMoreWall(start, 'g1', fn)
    expect(out.pages).toEqual(start.pages)
    expect(out.next).toEqual(cursor)
    expect(out.error).toBe('No encontramos ese grupo.')
  })

  it('a thrown call is an error state too', async () => {
    const out = await fetchMoreWall(start, 'g1', vi.fn().mockRejectedValue(new Error('offline')))
    expect(out.error).toMatch(/No pudimos conectar/)
    expect(out.pages).toEqual(start.pages)
  })

  it('without a cursor it does nothing', async () => {
    const fn = vi.fn()
    expect(await fetchMoreWall({ ...start, next: null }, 'g1', fn)).toEqual({ ...start, next: null })
    expect(fn).not.toHaveBeenCalled()
  })
})
