import { describe, expect, it } from 'vitest'
import { initialSection, rejectButtonProps, showFundSection, showRejectedList } from '@/components/groups/detail/fines-wiring'
import type { GroupWallItem } from '@/lib/groups-contract'
import type { GroupFineState, GroupFund, GroupRejectedItem } from '@/lib/groups-fines-contract'

const noFine: GroupFineState = { active: null, proposal: null, singleAdmin: false }
const active: GroupFineState = {
  ...noFine,
  active: { id: 'f', amount: 2500, purpose: 'Asado', startsOn: '2026-12-07', endsOn: null, boundCount: 2, iAmBound: false, myBoundFrom: null, myBoundUntil: null },
}
const proposal: GroupFineState = {
  ...noFine,
  proposal: { id: 'p', amount: 2500, purpose: 'Asado', proposedByName: 'Ana', expiresAt: '2026-12-01T00:00:00Z', acceptedCount: 1, neededCount: 2, myVote: null },
}
const emptyFund: GroupFund = { totals: { registered: 0, paid: 0, pending: 0 }, people: [], debts: [] }
const withDebts: GroupFund = {
  totals: { registered: 2500, paid: 0, pending: 2500 },
  people: [],
  debts: [{ debtId: 'd', userId: 'u2', username: 'b', displayName: 'B', avatarPath: null, avatarPreset: null, weekStart: '2026-11-16', amount: 2500, paidAt: null, paidByName: null, mine: false }],
}

describe('showFundSection', () => {
  const cases: [string, Parameters<typeof showFundSection>[0], boolean][] = [
    ['member, no fine', { role: 'member', archived: false, state: noFine, fund: emptyFund }, false],
    ['member, proposal open', { role: 'member', archived: false, state: proposal, fund: emptyFund }, true],
    ['member, fine active', { role: 'member', archived: false, state: active, fund: emptyFund }, true],
    ['member, fine ended (debts remain)', { role: 'member', archived: false, state: noFine, fund: withDebts }, true],
    ['member, archived, no fine', { role: 'member', archived: true, state: noFine, fund: emptyFund }, false],
    ['member, archived, had a fine', { role: 'member', archived: true, state: noFine, fund: withDebts }, true],
    ['admin, no fine', { role: 'admin', archived: false, state: noFine, fund: emptyFund }, true],
    ['admin, archived, no fine', { role: 'admin', archived: true, state: noFine, fund: emptyFund }, true],
    ['member, both reads failed', { role: 'member', archived: false, state: null, fund: null }, true],
    ['member, only the fund failed, no fine', { role: 'member', archived: false, state: noFine, fund: null }, true],
    ['member, only the state failed, no debt', { role: 'member', archived: false, state: null, fund: emptyFund }, true],
    ['admin, reads failed', { role: 'admin', archived: false, state: null, fund: null }, true],
  ]
  it.each(cases)('%s', (_n, args, expected) => expect(showFundSection(args)).toBe(expected))
})

describe('initialSection', () => {
  it('opens the asked section when it exists', () => {
    expect(initialSection('fondo', true)).toBe('fund')
    expect(initialSection('muro', true)).toBe('wall')
    expect(initialSection('muro', false)).toBe('wall')
  })
  it('falls back to the board for anything else, or a fund that is not shown', () => {
    expect(initialSection('fondo', false)).toBe('board')
    expect(initialSection(undefined, true)).toBe('board')
    expect(initialSection('x', true)).toBe('board')
    expect(initialSection(['fondo'], true)).toBe('board')
  })
})

const NOW = Date.parse('2026-11-23T12:00:00Z')
const item = (over: Partial<GroupWallItem> = {}): GroupWallItem => ({
  userId: 'u2', username: 'b', displayName: 'Beto', avatarPath: null, avatarPreset: null,
  checkinId: 'c1', localDate: '2026-11-23', photoPath: 'u2/x.jpg', createdAt: '2026-11-23T10:00:00Z', ...over,
})
const ctx = { groupId: 'g', myUserId: 'u1', role: 'admin' as const, archived: false, requiresPhoto: true, now: NOW }

describe('rejectButtonProps: the real values reach RejectPhotoButton', () => {
  it("another member's recent photo", () => {
    expect(rejectButtonProps(item(), ctx)).toEqual({
      groupId: 'g', checkinId: 'c1', ownerId: 'u2', ownerName: 'Beto', myUserId: 'u1', role: 'admin',
      archived: false, requiresPhoto: true, hasPhoto: true, createdAt: '2026-11-23T10:00:00Z', now: NOW,
    })
  })
  it('own photo: the owner is the viewer', () => {
    const p = rejectButtonProps(item({ userId: 'u1' }), ctx)
    expect(p.ownerId).toBe('u1')
    expect(p.myUserId).toBe('u1')
  })
  it('a photo older than 24 h keeps its real createdAt', () => {
    const p = rejectButtonProps(item({ createdAt: '2026-11-21T10:00:00Z' }), ctx)
    expect(p.createdAt).toBe('2026-11-21T10:00:00Z')
    expect(p.now).toBe(NOW)
  })
  it('no photo rule, member and archived travel as they are', () => {
    expect(rejectButtonProps(item(), { ...ctx, requiresPhoto: false }).requiresPhoto).toBe(false)
    expect(rejectButtonProps(item(), { ...ctx, role: 'member' }).role).toBe('member')
    expect(rejectButtonProps(item(), { ...ctx, archived: true }).archived).toBe(true)
  })
  it('a check-in without a photo says so', () => {
    expect(rejectButtonProps(item({ photoPath: null }), ctx).hasPhoto).toBe(false)
  })
})

describe('showRejectedList', () => {
  const rej = { checkinId: 'c' } as GroupRejectedItem
  it('admins always see it', () => {
    expect(showRejectedList({ role: 'admin', items: [] })).toBe(true)
    expect(showRejectedList({ role: 'admin', items: null })).toBe(true)
  })
  it('a member sees it when the read returned something, or failed', () => {
    expect(showRejectedList({ role: 'member', items: [rej] })).toBe(true)
    expect(showRejectedList({ role: 'member', items: [] })).toBe(false)
    expect(showRejectedList({ role: 'member', items: null })).toBe(true)
  })
})
