import { describe, expect, it, vi } from 'vitest'
import { createRunner } from '@/components/groups/detail/group-logic'
import {
  RULE_LINE,
  acceptedLine,
  activeTitle,
  applyDebtPaid,
  createFineHandlers,
  proposalExpired,
  fineUpdating,
  UPDATE_TIMEOUT_MS,
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

describe('applyDebtPaid: only what is known exactly', () => {
  const p = (n: string) => ({ userId: `u-${n}`, username: n, displayName: n, avatarPath: null, avatarPreset: null })
  const debt = (n: string, id: string, amount = 2500) => ({ ...p(n), debtId: id, weekStart: '2026-11-09', amount, paidAt: null, paidByName: null, mine: false })
  const fund: GroupFund = {
    totals: { registered: 7500, paid: 0, pending: 7500 },
    people: [{ ...p('beto'), pending: 5000 }],
    debts: [debt('beto', 'd1'), debt('beto', 'd2'), debt('gone', 'd3')],
  }

  it('mark paid for a listed person: row, totals and the person move by that debt', () => {
    const r = applyDebtPaid(fund, 'd1', true)
    expect(r.totals).toEqual({ registered: 7500, paid: 2500, pending: 5000 })
    expect(r.debts[0].paidAt).not.toBeNull()
    expect(r.debts[1].paidAt).toBeNull()
    expect(r.people[0].pending).toBe(2500)
  })

  it('mark paid for a person who is not listed (left): totals move, nobody is added', () => {
    const r = applyDebtPaid(fund, 'd3', true)
    expect(r.totals).toEqual({ registered: 7500, paid: 2500, pending: 5000 })
    expect(r.people.map((x) => x.userId)).toEqual(['u-beto'])
    expect(r.people[0].pending).toBe(5000)
  })

  it('the last pending debt of a person removes them from the list', () => {
    const r = applyDebtPaid(applyDebtPaid(fund, 'd1', true), 'd2', true)
    expect(r.people).toEqual([])
    expect(r.totals.pending).toBe(2500)
  })

  it('unmark: totals and a listed person go back; an unlisted person is still never added', () => {
    const marked = applyDebtPaid(fund, 'd1', true)
    const back = applyDebtPaid(marked, 'd1', false)
    expect(back.totals).toEqual(fund.totals)
    expect(back.people[0].pending).toBe(5000)
    const gone = applyDebtPaid(applyDebtPaid(fund, 'd3', true), 'd3', false)
    expect(gone.people.map((x) => x.userId)).toEqual(['u-beto'])
  })

  it('the person never goes below zero', () => {
    const odd: GroupFund = { ...fund, people: [{ ...p('beto'), pending: 1000 }] }
    expect(applyDebtPaid(odd, 'd1', true).people).toEqual([])
  })

  it('an unknown debt or a mark that changes nothing leaves the fund as it was', () => {
    expect(applyDebtPaid(fund, 'nope', true)).toBe(fund)
    expect(applyDebtPaid(fund, 'd1', false)).toBe(fund)
  })
})

describe('proposalExpired', () => {
  it('a proposal is closed from its expiry instant on', () => {
    const at = Date.parse('2026-11-30T12:00:00Z')
    expect(proposalExpired(proposal, at - 1)).toBe(false)
    expect(proposalExpired(proposal, at)).toBe(true)
    expect(proposalExpired({ ...proposal, expiresAt: 'nope' }, at)).toBe(false)
  })
})

describe('createFineHandlers: every accepted action asks for fresh data', () => {
  const setup = () => {
    const log: string[] = []
    const hooks = {
      begin: (s: string) => log.push(`begin:${s}`),
      fail: (s: string, e: string) => log.push(`fail:${s}:${e}`),
      end: () => log.push('end'),
      updating: () => log.push('updating'),
      changed: () => log.push('changed'),
    }
    const ok = () => vi.fn(async () => ({ ok: true as const, data: undefined }))
    const actions = {
      propose: vi.fn(async () => ({ ok: true as const, data: { id: 'n' } })),
      vote: ok(),
      acceptActive: ok(),
      stepOut: ok(),
      end: ok(),
      setDebtPaid: ok(),
    }
    return { log, handlers: createFineHandlers(createRunner(), actions, 'g1', hooks), actions }
  }

  for (const [name, call] of [
    ['propose', (h: ReturnType<typeof setup>['handlers']) => h.propose(2500, 'Asado')],
    ['vote at the threshold', (h: ReturnType<typeof setup>['handlers']) => h.vote('f1', true)],
    ['accept', (h: ReturnType<typeof setup>['handlers']) => h.accept()],
    ['step out', (h: ReturnType<typeof setup>['handlers']) => h.stepOut()],
    ['end', (h: ReturnType<typeof setup>['handlers']) => h.end()],
  ] as const)
    it(`${name}: success marks the fine area as updating, then calls onChanged`, async () => {
      const { log, handlers } = setup()
      await call(handlers)
      expect(log).toEqual([expect.stringMatching(/^begin:/), 'updating', 'changed', 'end'])
    })

  it('a debt mark asks for fresh data but does not blank the fine area', async () => {
    const { log, handlers } = setup()
    await handlers.debt('d1', true)
    expect(log).toEqual(['begin:debt:d1', 'changed', 'end'])
  })

  it('an error is reported in its slot and nothing is refreshed', async () => {
    const log: string[] = []
    const hooks = { begin: () => {}, fail: (s: string, e: string) => log.push(`${s}:${e}`), end: () => {}, updating: () => log.push('updating'), changed: () => log.push('changed') }
    const actions = { propose: vi.fn(), vote: vi.fn(async () => ({ ok: false as const, error: 'Esa votación ya terminó.' })), acceptActive: vi.fn(), stepOut: vi.fn(), end: vi.fn(), setDebtPaid: vi.fn() }
    await createFineHandlers(createRunner(), actions, 'g1', hooks).vote('f1', true)
    expect(log).toEqual(['vote:Esa votación ya terminó.'])
  })

  it('a second call while one is running does nothing', async () => {
    const { handlers, actions } = setup()
    let release!: () => void
    actions.stepOut.mockImplementationOnce(() => new Promise((res) => (release = () => res({ ok: true as const, data: undefined }))))
    const first = handlers.stepOut()
    await handlers.end()
    expect(actions.end).not.toHaveBeenCalled()
    release()
    await first
  })
})

describe('fineUpdating: the neutral state always has an exit', () => {
  const at = { since: 1000, propsChanged: false, settled: false, now: 1000 }
  it('still updating while nothing has happened and the time is not up', () => {
    expect(fineUpdating(at)).toBe(true)
    expect(fineUpdating({ ...at, now: 1000 + UPDATE_TIMEOUT_MS - 1 })).toBe(true)
  })
  it('ends when new props arrive', () => {
    expect(fineUpdating({ ...at, propsChanged: true })).toBe(false)
  })
  it('ends when the refresh settles (resolved or rejected)', () => {
    expect(fineUpdating({ ...at, settled: true })).toBe(false)
  })
  it('ends after 8 seconds', () => {
    expect(UPDATE_TIMEOUT_MS).toBe(8000)
    expect(fineUpdating({ ...at, now: 1000 + UPDATE_TIMEOUT_MS })).toBe(false)
  })
  it('is not updating when no action was accepted', () => {
    expect(fineUpdating({ ...at, since: null })).toBe(false)
  })
})
