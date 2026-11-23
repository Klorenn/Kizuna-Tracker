import { describe, expect, it, vi } from 'vitest'
import * as rpcs from '@/lib/groups-fines-rpc'

const G = '11111111-1111-4111-8111-111111111111'
const F = '22222222-2222-4222-8222-222222222222'
const D = '33333333-3333-4333-8333-333333333333'
const C = '44444444-4444-4444-8444-444444444444'

function client(answer: unknown = { data: null, error: null }) {
  return { rpc: vi.fn().mockResolvedValue(answer) }
}

describe('groups-fines-rpc: one function per RPC, exact names and arguments', () => {
  const cases: [string, (c: ReturnType<typeof client>) => Promise<unknown>, string, Record<string, unknown> | undefined][] = [
    ['proposeGroupFine', (c) => rpcs.proposeGroupFine(c, G, 2500, 'Asado'), 'propose_group_fine', { p_group_id: G, p_amount: 2500, p_purpose: 'Asado' }],
    ['voteGroupFine', (c) => rpcs.voteGroupFine(c, F, true), 'vote_group_fine', { p_fine_id: F, p_accept: true }],
    ['acceptGroupFine', (c) => rpcs.acceptGroupFine(c, G), 'accept_group_fine', { p_group_id: G }],
    ['leaveGroupFine', (c) => rpcs.leaveGroupFine(c, G), 'leave_group_fine', { p_group_id: G }],
    ['endGroupFine', (c) => rpcs.endGroupFine(c, G), 'end_group_fine', { p_group_id: G }],
    ['setGroupDebtPaid', (c) => rpcs.setGroupDebtPaid(c, D, false), 'set_group_debt_paid', { p_debt_id: D, p_paid: false }],
    ['rejectGroupCheckin', (c) => rpcs.rejectGroupCheckin(c, G, C, 'borrosa'), 'reject_group_checkin', { p_group_id: G, p_checkin_id: C, p_reason: 'borrosa' }],
    ['undoGroupCheckinRejection', (c) => rpcs.undoGroupCheckinRejection(c, G, C), 'undo_group_checkin_rejection', { p_group_id: G, p_checkin_id: C }],
    ['groupFineState', (c) => rpcs.groupFineState(c, G), 'group_fine_state', { p_group_id: G }],
    ['groupFund', (c) => rpcs.groupFund(c, G), 'group_fund', { p_group_id: G }],
    ['myFundDebts', (c) => rpcs.myFundDebts(c), 'my_fund_debts', undefined],
    ['groupRejectedCheckins', (c) => rpcs.groupRejectedCheckins(c, G), 'group_rejected_checkins', { p_group_id: G }],
  ]

  it.each(cases)('%s calls %s', async (_n, run, name, args) => {
    const c = client()
    await run(c)
    expect(c.rpc).toHaveBeenCalledTimes(1)
    if (args === undefined) expect(c.rpc).toHaveBeenCalledWith(name)
    else expect(c.rpc).toHaveBeenCalledWith(name, args)
  })

  it('returns data and error untouched', async () => {
    const err = { message: 'fine_pending', code: 'P0001' }
    expect(await rpcs.proposeGroupFine(client({ data: null, error: err }), G, 1, 'x')).toEqual({ data: null, error: err })
    expect(await rpcs.endGroupFine(client({ data: null, error: null }), G)).toEqual({ data: null, error: null })
  })
})
