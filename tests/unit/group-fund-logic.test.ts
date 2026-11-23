import { describe, expect, it, vi } from 'vitest'
import { createRunner } from '@/components/groups/detail/group-logic'
import {
  RULE_LINE,
  acceptedLine,
  activeTitle,
  applyDebtPaid,
  applyVote,
  canMarkPaid,
  debtStatusText,
  debtWeekLine,
  parseAmount,
  participationLine,
  prepareProposal,
  proposalTitle,
  runAndNotify,
  voteStatus,
} from '@/components/groups/fund/fund-logic'
import type { GroupFineActive, GroupFineProposal, GroupFund } from '@/lib/groups-fines-contract'

const proposal: GroupFineProposal = {
  id: 'f1',
  amount: 2500,
  purpose: 'Asado de fin de mes',
  proposedByName: 'Ana',
  expiresAt: '2026-11-30T12:00:00Z',
  acceptedCount: 2,
  neededCount: 3,
  myVote: null,
}
const active: GroupFineActive = {
  id: 'f0',
  amount: 2500,
  purpose: 'Asado',
  startsOn: '2026-11-23',
  endsOn: null,
  boundCount: 4,
  iAmBound: true,
  myBoundFrom: '2026-11-23',
  myBoundUntil: null,
}

describe('amount and proposal validation', () => {
  it('parses whole pesos typed with es-CL separators, never anything else', () => {
    expect(parseAmount('2500')).toBe(2500)
    expect(parseAmount(' $2.500 ')).toBe(2500)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('25,5')).toBeNull()
    expect(parseAmount('-3')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
  })

  it('accepts 1..100000 and a purpose of 1..80 characters, trimmed', () => {
    expect(prepareProposal({ amount: '2.500', purpose: '  Asado  ' })).toEqual({ ok: true, amount: 2500, purpose: 'Asado' })
    expect(prepareProposal({ amount: '1', purpose: 'x' }).ok).toBe(true)
    expect(prepareProposal({ amount: '100000', purpose: 'x'.repeat(80) }).ok).toBe(true)
  })

  it('invalid input gives the binding error', () => {
    const msg = 'El monto debe estar entre $1 y $100.000 y el fondo necesita un nombre.'
    for (const f of [
      { amount: '0', purpose: 'x' },
      { amount: '100001', purpose: 'x' },
      { amount: '', purpose: 'x' },
      { amount: '500', purpose: '   ' },
      { amount: '500', purpose: 'x'.repeat(81) },
    ])
      expect(prepareProposal(f)).toEqual({ ok: false, error: msg })
  })
})

describe('runAndNotify: one action at a time', () => {
  it('success calls the action once and then the callback with its data', async () => {
    const runner = createRunner()
    const action = vi.fn(async () => ({ ok: true as const, data: { id: 'n' } }))
    const onOk = vi.fn()
    const r = await runAndNotify(runner, action, onOk)
    expect(r).toEqual({ ok: true, data: { id: 'n' } })
    expect(action).toHaveBeenCalledTimes(1)
    expect(onOk).toHaveBeenCalledWith({ id: 'n' })
  })

  it('a second call while pending does nothing', async () => {
    const runner = createRunner()
    let release!: () => void
    const action = vi.fn(
      () => new Promise<{ ok: true; data: undefined }>((res) => (release = () => res({ ok: true, data: undefined }))),
    )
    const first = runAndNotify(runner, action)
    const second = await runAndNotify(runner, action)
    expect(second).toBeNull()
    expect(action).toHaveBeenCalledTimes(1)
    release()
    await first
    expect(runner.busy()).toBe(false)
  })

  it('a server error is returned, the callback is not called and the control is free again', async () => {
    const runner = createRunner()
    const onOk = vi.fn()
    const r = await runAndNotify(runner, async () => ({ ok: false as const, error: 'Esa votación ya terminó.' }), onOk)
    expect(r).toEqual({ ok: false, error: 'Esa votación ya terminó.' })
    expect(onOk).not.toHaveBeenCalled()
    expect(runner.busy()).toBe(false)
  })

  it('a thrown action becomes the connection error', async () => {
    const runner = createRunner()
    const r = await runAndNotify(runner, async () => {
      throw new Error('boom')
    })
    expect(r && !r.ok && r.error).toMatch(/No pudimos conectar/)
    expect(runner.busy()).toBe(false)
  })
})

describe('copy and derived state', () => {
  it('the rule line is the binding sentence', () => {
    expect(RULE_LINE).toBe('La app solo registra. El pago se hace fuera de la app.')
  })

  it('vote card lines', () => {
    expect(proposalTitle(proposal)).toBe('Ana propone una multa de $2.500 por semana incumplida')
    expect(acceptedLine(proposal)).toBe('Aceptaron 2 de 3 necesarios')
    expect(activeTitle(active)).toBe('Multa activa: $2.500 por semana incumplida')
  })

  it('vote status', () => {
    expect(voteStatus(null)).toBeNull()
    expect(voteStatus(true)).toBe('Aceptaste')
    expect(voteStatus(false)).toBe('No participas')
  })

  it('applyVote moves the count by the change only (first vote, flip, same vote)', () => {
    expect(applyVote(proposal, true)).toMatchObject({ myVote: true, acceptedCount: 3 })
    expect(applyVote(proposal, false)).toMatchObject({ myVote: false, acceptedCount: 2 })
    expect(applyVote({ ...proposal, myVote: true }, false)).toMatchObject({ myVote: false, acceptedCount: 1 })
    expect(applyVote({ ...proposal, myVote: false }, true)).toMatchObject({ myVote: true, acceptedCount: 3 })
    expect(applyVote({ ...proposal, myVote: true }, true)).toMatchObject({ myVote: true, acceptedCount: 2 })
  })

  it('participation line', () => {
    expect(participationLine(active)).toBe('Participas desde el lunes 23 nov')
    expect(participationLine({ ...active, iAmBound: false, myBoundFrom: null })).toBe('No participas')
    expect(participationLine({ ...active, myBoundUntil: '2026-12-07' })).toBe('Participas hasta el lunes 7 dic')
  })

  it('debt lines', () => {
    expect(debtWeekLine({ weekStart: '2026-11-16', amount: 2500 })).toBe('Semana del 16 nov · $2.500')
    expect(debtStatusText({ paidAt: null, paidByName: null })).toBe('Pendiente')
    expect(debtStatusText({ paidAt: '2026-11-20T10:00:00Z', paidByName: 'Ana' })).toBe('Pagada · marcó Ana')
    expect(debtStatusText({ paidAt: '2026-11-20T10:00:00Z', paidByName: null })).toBe('Pagada')
  })
})

describe('canMarkPaid', () => {
  const debt = { userId: 'u-b', mine: false }
  it('only admins of a live group', () => {
    expect(canMarkPaid({ role: 'admin', archived: false, debt, myUserId: 'u-a', singleAdmin: false })).toBe(true)
    expect(canMarkPaid({ role: 'member', archived: false, debt, myUserId: 'u-a', singleAdmin: false })).toBe(false)
    expect(canMarkPaid({ role: 'admin', archived: true, debt, myUserId: 'u-a', singleAdmin: false })).toBe(false)
  })
  it('absent on the admin own debt unless they are the only admin', () => {
    const own = { userId: 'u-a', mine: true }
    expect(canMarkPaid({ role: 'admin', archived: false, debt: own, myUserId: 'u-a', singleAdmin: false })).toBe(false)
    expect(canMarkPaid({ role: 'admin', archived: false, debt: own, myUserId: 'u-a', singleAdmin: true })).toBe(true)
  })
})

describe('applyDebtPaid', () => {
  const p = (n: string) => ({ userId: `u-${n}`, username: n, displayName: n, avatarPath: null, avatarPreset: null })
  const fund: GroupFund = {
    totals: { registered: 5000, paid: 0, pending: 5000 },
    people: [{ ...p('beto'), pending: 5000 }],
    debts: [
      { ...p('beto'), debtId: 'd1', weekStart: '2026-11-09', amount: 2500, paidAt: null, paidByName: null, mine: false },
      { ...p('beto'), debtId: 'd2', weekStart: '2026-11-16', amount: 2500, paidAt: null, paidByName: null, mine: false },
    ],
  }

  it('marking moves the amount from pending to paid and lowers the person', () => {
    const r = applyDebtPaid(fund, 'd1', true)
    expect(r.totals).toEqual({ registered: 5000, paid: 2500, pending: 2500 })
    expect(r.debts[0].paidAt).not.toBeNull()
    expect(r.debts[1].paidAt).toBeNull()
    expect(r.people[0].pending).toBe(2500)
  })

  it('a person with nothing left leaves the list; unmarking brings the amount back', () => {
    const both = applyDebtPaid(applyDebtPaid(fund, 'd1', true), 'd2', true)
    expect(both.people).toEqual([])
    const back = applyDebtPaid(both, 'd2', false)
    expect(back.totals).toEqual({ registered: 5000, paid: 2500, pending: 2500 })
    expect(back.debts[1].paidAt).toBeNull()
    expect(back.people[0].pending).toBe(2500)
  })

  it('an unknown debt or a mark that changes nothing leaves the fund as it was', () => {
    expect(applyDebtPaid(fund, 'nope', true)).toBe(fund)
    expect(applyDebtPaid(fund, 'd1', false)).toBe(fund)
  })
})
