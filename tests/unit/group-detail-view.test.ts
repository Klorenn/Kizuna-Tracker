import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/use-signed-urls', () => ({ useSignedUrls: () => ({}) }))

const { GroupDetailView } = await import('@/components/groups/detail/GroupDetailView')
const { applyDetail, applyMembers, EMPTY_OVERLAY } = await import('@/components/groups/detail/group-logic')
import type { GroupBoardRow, GroupDetail, GroupWallItem, GroupWeek } from '@/lib/groups-contract'

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const detail = (over: Partial<GroupDetail> = {}): GroupDetail => ({
  id: 'g1',
  name: 'Gym del sur',
  icon: 'barbell',
  color: 'salvia',
  description: 'Los martes y jueves',
  commitment: { name: 'Gimnasio', icon: 'barbell', targetPerWeek: 3, requiresPhoto: false },
  pendingCommitment: null,
  role: 'member',
  myHabitId: 'h1',
  streak: 3,
  memberCount: 3,
  archived: false,
  ...over,
})
const brow = (n: string, done: number, over: Partial<GroupBoardRow> = {}): GroupBoardRow => ({
  userId: `u-${n}`,
  username: n,
  displayName: n.toUpperCase(),
  avatarPath: null,
  avatarPreset: null,
  role: 'member',
  joinedOn: '2026-11-02',
  counts: true,
  done,
  target: 3,
  ...over,
})
const board = [brow('ana', 3, { role: 'admin' }), brow('beto', 1), brow('lu', 0, { counts: false })]
const week: GroupWeek = { weekStart: '2026-11-09', targetPerWeek: 3, requiresPhoto: false, membersCounted: 3, membersComplied: 2, myComplied: true }
const wallItem: GroupWallItem = {
  userId: 'u-ana',
  username: 'ana',
  displayName: 'ANA',
  avatarPath: null,
  avatarPreset: null,
  checkinId: 'c1',
  localDate: '2026-11-23',
  photoPath: null,
  createdAt: '2026-11-23T10:00:00Z',
}
const actions = {
  update: vi.fn(),
  setCommitment: vi.fn(),
  archive: vi.fn(),
  createInvite: vi.fn(),
  leave: vi.fn(),
  removeMember: vi.fn(),
  setAdmin: vi.fn(),
  loadMoreWall: vi.fn(),
  loadWeek: vi.fn(),
}
type Props = Parameters<typeof GroupDetailView>[0]
const render = (over: Partial<Props> = {}) =>
  renderToStaticMarkup(
    createElement(GroupDetailView, {
      detail: detail(),
      board,
      wall: { items: [wallItem], next: null },
      history: [week],
      myUserId: 'u-ana',
      actions,
      onLeft: () => {},
      today: '2026-11-23',
      ...over,
    }),
  )

describe('GroupDetailView header', () => {
  it('name, description, commitment line, streak and who complied this week', () => {
    const t = text(render())
    expect(t).toContain('Gym del sur')
    expect(t).toContain('Los martes y jueves')
    expect(t).toContain('Gimnasio · 3 por semana')
    expect(t).toContain('Racha del grupo: 3 semanas')
    expect(t).toContain('Cumplen 1 de 2 esta semana')
  })

  it('the streak is singular at 1 and hidden at 0', () => {
    expect(text(render({ detail: detail({ streak: 1 }) }))).toContain('Racha del grupo: 1 semana')
    expect(text(render({ detail: detail({ streak: 1 }) }))).not.toContain('1 semanas')
    expect(text(render({ detail: detail({ streak: 0 }) }))).not.toContain('Racha del grupo')
  })

  it('7 per week reads "todos los días"; a photo requirement is said', () => {
    const t = text(render({ detail: detail({ commitment: { name: 'Correr', icon: 'sneaker-move', targetPerWeek: 7, requiresPhoto: true } }) }))
    expect(t).toContain('Correr · todos los días · con foto')
  })

  it('a commitment pending from next Monday has its own line', () => {
    const t = text(
      render({ detail: detail({ pendingCommitment: { name: 'Yoga', icon: 'moon', targetPerWeek: 2, requiresPhoto: false, effectiveFrom: '2026-11-30' } }) }),
    )
    expect(t).toContain('Desde el lunes 30 nov: Yoga · 2 por semana')
  })

  it('without a description there is no empty paragraph', () => {
    expect(render({ detail: detail({ description: null }) })).not.toContain('Los martes')
  })

  it('the group colour reaches the header through the habit colour token', () => {
    const h = render()
    expect(h).toContain('data-habit-color="salvia"')
    expect(h).toContain('bg-(--habit)')
  })

  it('a long name takes at most two lines and cannot widen the page', () => {
    const h = render({ detail: detail({ name: 'N'.repeat(40) }) })
    expect(h).toContain('line-clamp-2')
    expect(h).toContain('break-words')
  })

  it('an archived group says so', () => {
    expect(text(render({ detail: detail({ archived: true }) }))).toContain('Este grupo está archivado.')
  })

  it('a failed board read drops the "Cumplen" line instead of inventing numbers', () => {
    expect(text(render({ board: null }))).not.toContain('esta semana')
  })
})

describe('GroupDetailView sections', () => {
  it('Tablero, Muro and Miembros, Tablero selected first', () => {
    const h = render()
    const radios = [...h.matchAll(/<button[^>]*role="radio"[^>]*aria-checked="(true|false)"[^>]*>(.*?)<\/button>/g)].map((m) => [text(m[2]), m[1]])
    expect(radios).toEqual([
      ['Tablero', 'true'],
      ['Muro', 'false'],
      ['Miembros', 'false'],
    ])
  })

  it('all three sections stay mounted, only Tablero is shown (each keeps its state when switching)', () => {
    const h = render()
    const panels = [...h.matchAll(/<div[^>]*data-panel="(board|wall|members)"([^>]*)>/g)].map((m) => [m[1], /\bhidden=""/.test(m[0])])
    expect(panels).toEqual([
      ['board', false],
      ['wall', true],
      ['members', true],
    ])
  })

  it('Tablero holds the board and the history; Muro the wall; Miembros the people', () => {
    const h = render()
    expect(text(h)).toContain('Semanas anteriores')
    expect(text(h)).toContain('Empieza el lunes')
    expect(h.indexOf('data-panel="wall"')).toBeLessThan(h.indexOf('Registró'))
    expect(h.indexOf('data-panel="members"')).toBeLessThan(h.indexOf('Salir del grupo'))
  })

  it('each section fails on its own', () => {
    const h = render({ board: null })
    expect(text(h)).toContain('Semanas anteriores')
    expect(h.match(/No pudimos cargar esto/g)!.length).toBeGreaterThanOrEqual(2)
    const wallFail = render({ wall: null })
    expect(wallFail.match(/No pudimos cargar esto/g)).toHaveLength(1)
    const histFail = render({ history: null })
    expect(histFail.match(/No pudimos cargar esto/g)).toHaveLength(1)
    expect(text(histFail)).toContain('Empieza el lunes')
  })

  it('an administrator gets the admin actions, a member does not, an archived group nobody', () => {
    expect(text(render({ detail: detail({ role: 'admin' }) }))).toContain('Archivar grupo')
    expect(text(render())).not.toContain('Archivar grupo')
    expect(text(render({ detail: detail({ role: 'admin', archived: true }) }))).not.toContain('Archivar grupo')
  })
})

describe('local view of what the server accepted (overlay)', () => {
  const d = detail({ role: 'admin' })
  it('empty overlay changes nothing', () => {
    expect(applyDetail(d, EMPTY_OVERLAY)).toEqual(d)
    expect(applyMembers(board, EMPTY_OVERLAY)).toEqual(board)
    expect(applyMembers(null, EMPTY_OVERLAY)).toBeNull()
  })
  it('edited fields, pending commitment and archive show at once', () => {
    const out = applyDetail(d, {
      ...EMPTY_OVERLAY,
      fields: { name: 'Nuevo', icon: 'moon', color: 'rosa', description: '' },
      pending: { name: 'Yoga', icon: 'moon', targetPerWeek: 2, requiresPhoto: true, effectiveFrom: '2026-11-30' },
      archived: true,
    })
    expect(out).toMatchObject({ name: 'Nuevo', icon: 'moon', color: 'rosa', description: null, archived: true })
    expect(out.pendingCommitment).toEqual({ name: 'Yoga', icon: 'moon', targetPerWeek: 2, requiresPhoto: true, effectiveFrom: '2026-11-30' })
  })
  it('removed members leave the list and the count; roles change in place', () => {
    const o = { ...EMPTY_OVERLAY, removed: ['u-beto'], roles: { 'u-lu': 'admin' as const } }
    expect(applyMembers(board, o)!.map((r) => [r.userId, r.role])).toEqual([
      ['u-ana', 'admin'],
      ['u-lu', 'admin'],
    ])
    expect(applyDetail(d, o).memberCount).toBe(2)
  })
})
