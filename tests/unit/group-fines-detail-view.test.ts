import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/use-signed-urls', () => ({ useSignedUrls: () => ({ 'u2/x.jpg': 'https://signed/x.jpg' }) }))

const { GroupDetailView } = await import('@/components/groups/detail/GroupDetailView')
const { InvitePreviewView } = await import('@/components/groups/join/InvitePreviewView')
import type { GroupBoardRow, GroupDetail, GroupWallItem } from '@/lib/groups-contract'
import type { GroupFineState, GroupFund, GroupRejectedItem } from '@/lib/groups-fines-contract'

const RULE = 'La app solo registra. El pago se hace fuera de la app.'
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const NOW = Date.parse('2026-11-23T12:00:00Z')

const detail = (over: Partial<GroupDetail> = {}): GroupDetail => ({
  id: 'g1', name: 'Gym', icon: 'barbell', color: 'salvia', description: null,
  commitment: { name: 'Gimnasio', icon: 'barbell', targetPerWeek: 3, requiresPhoto: true },
  pendingCommitment: null, role: 'admin', myHabitId: 'h1', streak: 0, memberCount: 2, archived: false, ...over,
})
const row = (n: string, role: 'admin' | 'member'): GroupBoardRow => ({
  userId: `u-${n}`, username: n, displayName: n.toUpperCase(), avatarPath: null, avatarPreset: null,
  role, joinedOn: '2026-11-02', counts: true, done: 1, target: 3,
})
const board = [row('ana', 'admin'), row('beto', 'member')]
const wallItem: GroupWallItem = {
  userId: 'u-beto', username: 'beto', displayName: 'BETO', avatarPath: null, avatarPreset: null,
  checkinId: 'c1', localDate: '2026-11-23', photoPath: 'u2/x.jpg', createdAt: '2026-11-23T10:00:00Z',
}
const noFine: GroupFineState = { active: null, proposal: null, singleAdmin: false }
const emptyFund: GroupFund = { totals: { registered: 0, paid: 0, pending: 0 }, people: [], debts: [] }
const active: GroupFineState = {
  ...noFine,
  active: { id: 'f', amount: 2500, purpose: 'Asado', startsOn: '2026-11-16', endsOn: null, boundCount: 1, iAmBound: false, myBoundFrom: null, myBoundUntil: null },
}
const rejected: GroupRejectedItem = {
  userId: 'u-beto', username: 'beto', displayName: 'BETO', avatarPath: null, avatarPreset: null,
  checkinId: 'c9', localDate: '2026-11-22', photoPath: null, reason: 'Foto borrosa', rejectedByName: 'ANA', rejectedAt: '2026-11-22T10:00:00Z',
}
const noop = vi.fn()
const fineActions = { propose: noop, vote: noop, acceptActive: noop, stepOut: noop, end: noop, setDebtPaid: noop, rejectPhoto: noop, undoRejectPhoto: noop }
const actions = {
  update: noop, setCommitment: noop, archive: noop, createInvite: noop, leave: noop, removeMember: noop, setAdmin: noop, loadMoreWall: noop, loadWeek: noop,
}
type Props = Parameters<typeof GroupDetailView>[0]
type Fines = NonNullable<Props['fines']>
const render = (over: Partial<Props> = {}, fines: Partial<Fines> | null = {}) =>
  renderToStaticMarkup(
    createElement(GroupDetailView, {
      detail: detail(), board, wall: { items: [wallItem], next: null }, history: [], myUserId: 'u-ana',
      actions, onLeft: () => {}, today: '2026-11-23',
      fines: fines === null ? undefined : { state: noFine, fund: emptyFund, rejected: [], now: NOW, actions: fineActions, onChanged: () => {}, ...fines },
      ...over,
    }),
  )

describe('GroupDetailView: the Fondo section', () => {
  it('without fines props the view is unchanged: three sections', () => {
    const h = render({}, null)
    expect(h).not.toContain('>Fondo<')
    expect(h).not.toContain('Rechazar foto')
  })
  it('admins always get Fondo, after Miembros, with "Proponer multa"', () => {
    const h = render()
    expect(h.indexOf('>Miembros<')).toBeLessThan(h.indexOf('>Fondo<'))
    expect(text(h)).toContain('Proponer multa')
  })
  it('a plain member with no fine does not', () => {
    const t = text(render({ detail: detail({ role: 'member' }), myUserId: 'u-beto' }))
    expect(t).not.toContain('Proponer multa')
    expect(t).not.toContain('Este grupo no tiene multa')
  })
  it('a plain member with an active fine does, and the rule line is on it', () => {
    const t = text(render({ detail: detail({ role: 'member' }), myUserId: 'u-beto' }, { state: active }))
    expect(t).toContain('Multa activa')
    expect(t).toContain(RULE)
  })
  it('a member who opened ?seccion=fondo without a Fondo tab stays on the board', () => {
    const h = render({ detail: detail({ role: 'member' }), myUserId: 'u-beto', initialSection: 'fund' })
    expect(h).not.toMatch(/data-panel="board" hidden/)
  })
  it('an admin of a group without a photo rule and nothing rejected sees no empty "Fotos rechazadas"', () => {
    const d = detail({ commitment: { name: 'G', icon: 'barbell', targetPerWeek: 3, requiresPhoto: false } })
    expect(text(render({ detail: d }, { rejected: [] }))).not.toContain('Fotos rechazadas')
    expect(text(render({ detail: d }, { rejected: null }))).toContain('Fotos rechazadas')
  })
  it('a failed read shows LoadFailed inside the section, never an empty fund', () => {
    const t = text(render({}, { state: null, fund: null }))
    expect(t).toContain('No pudimos cargar')
  })
  it('opens the asked section (the fine notification) and falls back to the board', () => {
    expect(render({ initialSection: 'fund' }, { state: active })).toMatch(/data-panel="fund"[^>]*>/)
    expect(render({ initialSection: 'fund' }, { state: active })).not.toMatch(/data-panel="fund" hidden/)
    expect(render({ initialSection: 'fund' }, { state: active })).toMatch(/data-panel="board" hidden/)
    expect(render({ initialSection: 'fund' }, null)).not.toMatch(/data-panel="board" hidden/)
  })
})

describe('GroupDetailView: the question after joining', () => {
  const member = { detail: detail({ role: 'member' }), myUserId: 'u-beto', initialSection: 'fund' as const }
  it('asks the person who just joined a group with a fine in force', () => {
    const t = text(render({ ...member, justJoined: true }, { state: active }))
    expect(t).toContain('Este grupo tiene una multa de $2.500 por cada semana que no cumplas. Va al fondo: Asado. Solo aplica si la aceptas.')
    expect(t).toContain('Aceptar multa')
    expect(t).toContain('Ahora no')
    expect(t).toContain(RULE)
  })
  it('only when they just joined: the normal fund section otherwise', () => {
    const t = text(render({ ...member }, { state: active }))
    expect(t).not.toContain('Aceptar multa')
    expect(t).not.toContain('Ahora no')
    expect(t).toContain('Sumarme desde el próximo lunes')
  })
  it('not when already bound, or with only a proposal', () => {
    const bound: GroupFineState = { ...active, active: { ...active.active!, iAmBound: true, myBoundFrom: '2026-12-07' } }
    expect(text(render({ ...member, justJoined: true }, { state: bound }))).not.toContain('Aceptar multa')
    expect(text(render({ ...member, justJoined: true }, { state: noFine }))).not.toContain('Aceptar multa')
  })
})

describe('GroupDetailView: the wall with rejection', () => {
  it("an admin gets the reject button on another member's recent photo", () => {
    expect(text(render())).toContain('Rechazar foto')
  })
  it('not on a group without the photo rule, not on an archived group, not for a member', () => {
    expect(render({ detail: detail({ commitment: { name: 'G', icon: 'barbell', targetPerWeek: 3, requiresPhoto: false } }) })).not.toContain('Rechazar foto')
    expect(render({ detail: detail({ archived: true }) })).not.toContain('Rechazar foto')
    expect(render({ detail: detail({ role: 'member' }), myUserId: 'u-beto' })).not.toContain('Rechazar foto')
  })
  it('not on a photo older than 24 h', () => {
    const old = { ...wallItem, createdAt: '2026-11-21T10:00:00Z' }
    expect(render({ wall: { items: [old], next: null } })).not.toContain('Rechazar foto')
  })
  it('admins see the rejected list with Deshacer; the owner sees the reason without it', () => {
    const a = text(render({}, { rejected: [rejected] }))
    expect(a).toContain('Fotos rechazadas')
    expect(a).toContain('Foto borrosa')
    expect(a).toContain('Deshacer rechazo')
    const m = text(render({ detail: detail({ role: 'member' }), myUserId: 'u-beto' }, { rejected: [rejected] }))
    expect(m).toContain('Foto borrosa')
    expect(m).not.toContain('Deshacer rechazo')
  })
  it('a plain member with nothing rejected sees no list', () => {
    expect(text(render({ detail: detail({ role: 'member' }), myUserId: 'u-beto' }, { rejected: [] }))).not.toContain('Fotos rechazadas')
  })
})

describe('InvitePreviewView with a fine', () => {
  const preview = { name: 'Gym', icon: 'barbell', color: 'salvia', commitment: { name: 'Gimnasio', icon: 'barbell', targetPerWeek: 3, requiresPhoto: false }, memberCount: 2, full: false }
  const base = { preview, signedIn: true, loginHref: '/login', habits: [], code: 'K7QM4PXD', actions: { join: noop }, onJoined: () => {} }
  it('shows amount, purpose, the optional line and the rule line', () => {
    const t = text(renderToStaticMarkup(createElement(InvitePreviewView, { ...base, fine: { amount: 2500, purpose: 'Asado de fin de mes' } })))
    expect(t.replace(/ /g, '')).toContain('Multa:$2.500porsemanaincumplida') // the digits sit in mono spans
    expect(t).toContain('Asado de fin de mes')
    expect(t).toContain('La multa solo aplica si la aceptas.')
    expect(t).toContain(RULE)
  })
  it('without a fine none of it shows', () => {
    for (const fine of [undefined, null]) {
      const t = text(renderToStaticMarkup(createElement(InvitePreviewView, { ...base, fine })))
      expect(t).not.toContain('multa')
      expect(t).not.toContain(RULE)
    }
  })
  it('a signed-out visitor sees it too', () => {
    const t = text(renderToStaticMarkup(createElement(InvitePreviewView, { ...base, signedIn: false, fine: { amount: 2500, purpose: 'Asado' } })))
    expect(t).toContain('La multa solo aplica si la aceptas.')
  })
})
