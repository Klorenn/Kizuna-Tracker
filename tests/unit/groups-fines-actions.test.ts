import { beforeEach, describe, expect, it, vi } from 'vitest'

const ME = '11111111-1111-4111-8111-111111111111'
const G = '33333333-3333-4333-8333-333333333333'
const F = '44444444-4444-4444-8444-444444444444'
const D = '55555555-5555-4555-8555-555555555555'
const C = '66666666-6666-4666-8666-666666666666'
const NEW = '77777777-7777-4777-8777-777777777777'

const rpc = vi.fn()
const revalidatePath = vi.fn()
let log: string[] = []
let signedIn = true
let adminUsed = false

const client = {
  rpc: (...a: unknown[]) => {
    log.push(`rpc:${String(a[0])}`)
    return rpc(...a)
  },
  from: (table: string) => {
    throw new Error(`no direct access to ${table}`)
  },
}

vi.mock('@/lib/require-user', () => ({
  requireUser: async () => {
    log.push('requireUser')
    return signedIn
      ? { ok: true, supabase: client, userId: ME }
      : { ok: false, error: 'Inicia sesión para continuar.', unavailable: false }
  },
}))
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => client }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    adminUsed = true
    return client
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

import * as actions from '@/app/(app)/grupos/fines-actions'

const GENERIC = 'No pudimos completar la acción. Inténtalo de nuevo.'
const SIGN_IN = 'Inicia sesión para continuar.'
const OK = { data: null, error: null }

beforeEach(() => {
  rpc.mockReset()
  revalidatePath.mockReset()
  log = []
  signedIn = true
  adminUsed = false
})

const fail = (message: string) => rpc.mockResolvedValue({ data: null, error: { message, code: 'P0001' } })

type Case = {
  name: string
  run: () => Promise<unknown>
  rpcName: string
  args: Record<string, unknown>
  paths: unknown[][]
  codes: string[]
}

const cases: Case[] = [
  {
    name: 'propose',
    run: () => actions.propose(G, 2500, '  Asado  '),
    rpcName: 'propose_group_fine',
    args: { p_group_id: G, p_amount: 2500, p_purpose: 'Asado' },
    paths: [[`/grupos/${G}`]],
    codes: ['not_group_admin', 'invalid_fine', 'fine_pending', 'group_archived', 'group_not_found'],
  },
  {
    name: 'vote',
    run: () => actions.vote(F, true),
    rpcName: 'vote_group_fine',
    args: { p_fine_id: F, p_accept: true },
    paths: [['/grupos/[id]', 'page']],
    codes: ['fine_not_found', 'fine_closed', 'not_group_member', 'group_archived'],
  },
  {
    name: 'acceptActive',
    run: () => actions.acceptActive(G),
    rpcName: 'accept_group_fine',
    args: { p_group_id: G },
    paths: [[`/grupos/${G}`]],
    codes: ['no_active_fine', 'already_bound', 'not_group_member', 'group_archived'],
  },
  {
    name: 'stepOut',
    run: () => actions.stepOut(G),
    rpcName: 'leave_group_fine',
    args: { p_group_id: G },
    paths: [[`/grupos/${G}`]],
    codes: ['no_active_fine', 'not_bound', 'not_group_member'],
  },
  {
    name: 'end',
    run: () => actions.end(G),
    rpcName: 'end_group_fine',
    args: { p_group_id: G },
    paths: [[`/grupos/${G}`]],
    codes: ['no_active_fine', 'not_group_admin', 'group_not_found'],
  },
  {
    name: 'setDebtPaid',
    run: () => actions.setDebtPaid(D, true),
    rpcName: 'set_group_debt_paid',
    args: { p_debt_id: D, p_paid: true },
    paths: [['/grupos/[id]', 'page'], ['/deudas']],
    codes: ['debt_not_found', 'not_group_admin', 'own_debt'],
  },
  {
    name: 'rejectPhoto',
    run: () => actions.rejectPhoto(G, C, '  Foto borrosa '),
    rpcName: 'reject_group_checkin',
    args: { p_group_id: G, p_checkin_id: C, p_reason: 'Foto borrosa' },
    paths: [[`/grupos/${G}`]],
    codes: ['not_group_admin', 'no_photo_rule', 'checkin_not_found', 'own_checkin', 'reject_window_closed', 'week_closed', 'invalid_reason'],
  },
  {
    name: 'undoRejectPhoto',
    run: () => actions.undoRejectPhoto(G, C),
    rpcName: 'undo_group_checkin_rejection',
    args: { p_group_id: G, p_checkin_id: C },
    paths: [[`/grupos/${G}`]],
    codes: ['not_group_admin', 'checkin_not_found', 'week_closed'],
  },
]

const COPY: Record<string, string> = {
  not_group_admin: 'Solo un administrador puede hacer eso.',
  invalid_fine: 'El monto debe estar entre $1 y $100.000 y el fondo necesita un nombre.',
  fine_pending: 'Ya hay una propuesta de multa en votación.',
  group_archived: 'Este grupo está archivado.',
  group_not_found: 'No encontramos ese grupo.',
  not_group_member: 'No encontramos ese grupo.',
  fine_not_found: 'Esa votación ya terminó.',
  fine_closed: 'Esa votación ya terminó.',
  no_active_fine: 'Este grupo no tiene una multa activa.',
  already_bound: 'Ya participas en la multa.',
  not_bound: 'No participas en la multa.',
  debt_not_found: 'No encontramos esa deuda.',
  own_debt: 'Otro administrador debe marcar tu deuda.',
  no_photo_rule: 'Este grupo no pide foto.',
  checkin_not_found: 'No encontramos ese registro.',
  own_checkin: 'No puedes rechazar tu propia foto.',
  reject_window_closed: 'Solo se puede rechazar una foto dentro de 24 horas.',
  week_closed: 'Esa semana ya cerró.',
  invalid_reason: 'Escribe un motivo de hasta 140 letras.',
}

describe.each(cases)('$name', (c) => {
  it('requires a session first: nothing else runs', async () => {
    signedIn = false
    expect(await c.run()).toEqual({ ok: false, error: SIGN_IN })
    expect(log).toEqual(['requireUser'])
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('calls its RPC with the caller session, then revalidates what changed once each', async () => {
    rpc.mockResolvedValue(c.name === 'propose' ? { data: NEW, error: null } : OK)
    const r = await c.run()
    expect(r).toEqual({ ok: true, data: c.name === 'propose' ? { id: NEW } : undefined })
    expect(log).toEqual(['requireUser', `rpc:${c.rpcName}`])
    expect(rpc).toHaveBeenCalledWith(c.rpcName, c.args)
    expect(revalidatePath.mock.calls).toEqual(c.paths)
    expect(adminUsed).toBe(false)
  })

  it.each(c.codes)('maps %s to its Spanish copy and revalidates nothing', async (code) => {
    fail(`ERROR: ${code}`)
    expect(await c.run()).toEqual({ ok: false, error: COPY[code] })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('maps an unknown database error to the generic copy without echoing it', async () => {
    fail('relation "group_fines" does not exist: secret detail')
    const r = await c.run()
    expect(r).toEqual({ ok: false, error: GENERIC })
    expect(JSON.stringify(r)).not.toContain('secret')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('a thrown call is the generic copy', async () => {
    rpc.mockRejectedValue(new Error('socket hang up'))
    expect(await c.run()).toEqual({ ok: false, error: GENERIC })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('propose: validation happens on the server before any call', () => {
  const bad: [string, unknown, unknown, unknown][] = [
    ['a group id that is not a uuid', 'x', 2500, 'Asado'],
    ['zero', G, 0, 'Asado'],
    ['a negative amount', G, -10, 'Asado'],
    ['an amount over the limit', G, 100001, 'Asado'],
    ['a fractional amount', G, 10.5, 'Asado'],
    ['an amount as text', G, '2500', 'Asado'],
    ['NaN', G, NaN, 'Asado'],
    ['an empty purpose', G, 2500, ''],
    ['a blank purpose', G, 2500, '   '],
    ['a purpose over 80', G, 2500, 'x'.repeat(81)],
    ['a purpose that is not text', G, 2500, 7],
  ]
  it.each(bad)('refuses %s', async (_n, group, amount, purpose) => {
    const r = (await actions.propose(group as string, amount as number, purpose as string)) as { ok: boolean; error: string }
    expect(r.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('names the amount and purpose rule, and the group as not found', async () => {
    expect(await actions.propose(G, 0, 'Asado')).toEqual({ ok: false, error: COPY.invalid_fine })
    expect(await actions.propose('x', 2500, 'Asado')).toEqual({ ok: false, error: COPY.group_not_found })
  })
  it('accepts the limits', async () => {
    rpc.mockResolvedValue({ data: NEW, error: null })
    expect((await actions.propose(G, 1, 'x')).ok).toBe(true)
    expect((await actions.propose(G, 100000, 'x'.repeat(80))).ok).toBe(true)
  })
  it('a database answer that is not an id is not a success', async () => {
    rpc.mockResolvedValue({ data: 'nope', error: null })
    expect(await actions.propose(G, 2500, 'Asado')).toEqual({ ok: false, error: GENERIC })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('vote', () => {
  it('passes false as a vote against', async () => {
    rpc.mockResolvedValue(OK)
    await actions.vote(F, false)
    expect(rpc).toHaveBeenCalledWith('vote_group_fine', { p_fine_id: F, p_accept: false })
  })
  it('refuses a bad id or a non-boolean before any call', async () => {
    expect(await actions.vote('x', true)).toEqual({ ok: false, error: COPY.fine_closed })
    expect((await actions.vote(F, 'yes' as unknown as boolean)).ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('group-scoped actions refuse a bad group id before any call', () => {
  it.each([
    ['acceptActive', () => actions.acceptActive('x')],
    ['stepOut', () => actions.stepOut('x')],
    ['end', () => actions.end('x')],
    ['rejectPhoto', () => actions.rejectPhoto('x', C, 'motivo')],
    ['undoRejectPhoto', () => actions.undoRejectPhoto('x', C)],
  ])('%s', async (_n, run) => {
    expect(await run()).toEqual({ ok: false, error: COPY.group_not_found })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('setDebtPaid', () => {
  it('passes false to clear a mark', async () => {
    rpc.mockResolvedValue(OK)
    await actions.setDebtPaid(D, false)
    expect(rpc).toHaveBeenCalledWith('set_group_debt_paid', { p_debt_id: D, p_paid: false })
  })
  it('refuses a bad id or a non-boolean before any call', async () => {
    expect(await actions.setDebtPaid('x', true)).toEqual({ ok: false, error: COPY.debt_not_found })
    expect((await actions.setDebtPaid(D, 1 as unknown as boolean)).ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('rejectPhoto and undoRejectPhoto', () => {
  it('validates the reason: trimmed, 1..140, only the trimmed text is sent', async () => {
    for (const reason of ['', '   ', 'x'.repeat(141), 5 as unknown as string]) {
      expect(await actions.rejectPhoto(G, C, reason)).toEqual({ ok: false, error: COPY.invalid_reason })
    }
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValue(OK)
    expect((await actions.rejectPhoto(G, C, 'x'.repeat(140))).ok).toBe(true)
  })
  it('refuses a bad check-in id before any call; undo carries no reason', async () => {
    expect(await actions.rejectPhoto(G, 'x', 'motivo')).toEqual({ ok: false, error: COPY.checkin_not_found })
    expect(await actions.undoRejectPhoto(G, 'x')).toEqual({ ok: false, error: COPY.checkin_not_found })
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValue(OK)
    await actions.undoRejectPhoto(G, C)
    expect(rpc).toHaveBeenCalledWith('undo_group_checkin_rejection', { p_group_id: G, p_checkin_id: C })
    expect(Object.keys(rpc.mock.calls[0][1] as object)).not.toContain('p_reason')
  })
})

describe('the module', () => {
  it('exports exactly the eight actions of GroupFineActions', () => {
    expect(Object.keys(actions).sort()).toEqual(['acceptActive', 'end', 'propose', 'rejectPhoto', 'setDebtPaid', 'stepOut', 'undoRejectPhoto', 'vote'])
  })
})
