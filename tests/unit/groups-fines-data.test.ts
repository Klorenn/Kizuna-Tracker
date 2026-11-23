import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const rpc = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => ({ rpc }) }))

const data = await import('@/lib/groups-fines-data')

const G = '11111111-1111-4111-8111-111111111111'
const F = '22222222-2222-4222-8222-222222222222'
const U = '33333333-3333-4333-8333-333333333333'
const D = '44444444-4444-4444-8444-444444444444'
const C = '55555555-5555-4555-8555-555555555555'

beforeEach(() => {
  rpc.mockReset()
})

const person = (over: Record<string, unknown> = {}) => ({
  user_id: U,
  username: 'ana_g',
  display_name: 'Ana',
  avatar_path: 'u/a.png',
  avatar_preset: null,
  ...over,
})
const PERSON = { userId: U, username: 'ana_g', displayName: 'Ana', avatarPath: 'u/a.png', avatarPreset: null }

const activeJson = (over: Record<string, unknown> = {}) => ({
  id: F,
  amount: 2500,
  purpose: 'Asado',
  starts_on: '2026-11-30',
  ends_on: null,
  bound_count: 4,
  i_am_bound: true,
  my_bound_from: '2026-11-30',
  my_bound_until: null,
  ...over,
})
const proposalJson = (over: Record<string, unknown> = {}) => ({
  id: F,
  amount: 3000,
  purpose: 'Cena',
  proposed_by_name: 'Beto',
  expires_at: '2026-11-30T12:00:00Z',
  accepted_count: 2,
  needed_count: 3,
  my_vote: null,
  ...over,
})

describe('loadGroupFineState', () => {
  it('maps an active fine and a proposal to the contract types', async () => {
    rpc.mockResolvedValue({ data: { active: activeJson(), proposal: proposalJson({ my_vote: true }), single_admin: true }, error: null })
    expect(await data.loadGroupFineState(G)).toEqual({
      ok: true,
      data: {
        active: {
          id: F,
          amount: 2500,
          purpose: 'Asado',
          startsOn: '2026-11-30',
          endsOn: null,
          boundCount: 4,
          iAmBound: true,
          myBoundFrom: '2026-11-30',
          myBoundUntil: null,
        },
        proposal: {
          id: F,
          amount: 3000,
          purpose: 'Cena',
          proposedByName: 'Beto',
          expiresAt: '2026-11-30T12:00:00Z',
          acceptedCount: 2,
          neededCount: 3,
          myVote: true,
        },
        singleAdmin: true,
      },
    })
    expect(rpc).toHaveBeenCalledWith('group_fine_state', { p_group_id: G })
  })

  it('null active and null proposal are a valid "no fine" state, not an error', async () => {
    rpc.mockResolvedValue({ data: { active: null, proposal: null, single_admin: false }, error: null })
    expect(await data.loadGroupFineState(G)).toEqual({ ok: true, data: { active: null, proposal: null, singleAdmin: false } })
  })

  it('keeps nulls: not voted, not bound, ended fine', async () => {
    rpc.mockResolvedValue({
      data: {
        active: activeJson({ ends_on: '2026-12-07', i_am_bound: false, my_bound_from: null, my_bound_until: null }),
        proposal: proposalJson({ my_vote: false }),
        single_admin: false,
      },
      error: null,
    })
    const r = await data.loadGroupFineState(G)
    expect(r.ok && r.data.active).toMatchObject({ endsOn: '2026-12-07', iAmBound: false, myBoundFrom: null, myBoundUntil: null })
    expect(r.ok && r.data.proposal?.myVote).toBe(false)
  })

  it.each([
    ['null payload', null],
    ['a list', []],
    ['missing single_admin', { active: null, proposal: null }],
    ['missing active key', { proposal: null, single_admin: false }],
    ['an amount as a string', { active: activeJson({ amount: '2500' }), proposal: null, single_admin: false }],
    ['a fractional amount', { active: activeJson({ amount: 12.5 }), proposal: null, single_admin: false }],
    ['a negative amount', { active: activeJson({ amount: -1 }), proposal: null, single_admin: false }],
    ['i_am_bound not a boolean', { active: activeJson({ i_am_bound: 'yes' }), proposal: null, single_admin: false }],
    ['a proposal without a name', { active: null, proposal: proposalJson({ proposed_by_name: undefined }), single_admin: false }],
    ['my_vote of the wrong type', { active: null, proposal: proposalJson({ my_vote: 'si' }), single_admin: false }],
    ['a negative count', { active: null, proposal: proposalJson({ needed_count: -2 }), single_admin: false }],
  ])('a malformed payload (%s) is an error state', async (_n, payload) => {
    rpc.mockResolvedValue({ data: payload, error: null })
    const r = await data.loadGroupFineState(G)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/^No pudimos cargar/)
  })

  it('a database error is an error state with generic copy, never the raw message', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'relation "group_fines" does not exist' } })
    const r = await data.loadGroupFineState(G)
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/^No pudimos cargar/) })
    expect(JSON.stringify(r)).not.toContain('relation')
  })

  it('a thrown call is an error state', async () => {
    rpc.mockRejectedValue(new Error('network down'))
    expect((await data.loadGroupFineState(G)).ok).toBe(false)
  })

  it('a stranger gets the not-found state, an invalid id makes no call', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_group_member' } })
    expect(await data.loadGroupFineState(G)).toMatchObject({ ok: false, notFound: true })
    rpc.mockClear()
    expect(await data.loadGroupFineState('nope')).toMatchObject({ ok: false, notFound: true })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('a signed-out caller is told to sign in', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_authenticated' } })
    expect(await data.loadGroupFineState(G)).toEqual({ ok: false, error: 'Inicia sesión para continuar.' })
  })

  it('uses the client it is given', async () => {
    const mine = { rpc: vi.fn().mockResolvedValue({ data: { active: null, proposal: null, single_admin: false }, error: null }) }
    expect((await data.loadGroupFineState(G, mine)).ok).toBe(true)
    expect(mine.rpc).toHaveBeenCalledTimes(1)
    expect(rpc).not.toHaveBeenCalled()
  })
})

const debtJson = (over: Record<string, unknown> = {}) => ({
  debt_id: D,
  week_start: '2026-11-16',
  amount: 2500,
  paid_at: null,
  paid_by_name: null,
  mine: false,
  ...person(),
  ...over,
})
const fundJson = (over: Record<string, unknown> = {}) => ({
  totals: { registered: 7500, paid: 2500, pending: 5000 },
  people: [{ ...person(), pending: 5000 }],
  debts: [debtJson(), debtJson({ debt_id: C, paid_at: '2026-11-20T10:00:00Z', paid_by_name: 'Beto', mine: true })],
  ...over,
})

describe('loadGroupFund', () => {
  it('maps totals, people and debts', async () => {
    rpc.mockResolvedValue({ data: fundJson(), error: null })
    expect(await data.loadGroupFund(G)).toEqual({
      ok: true,
      data: {
        totals: { registered: 7500, paid: 2500, pending: 5000 },
        people: [{ ...PERSON, pending: 5000 }],
        debts: [
          { ...PERSON, debtId: D, weekStart: '2026-11-16', amount: 2500, paidAt: null, paidByName: null, mine: false },
          { ...PERSON, debtId: C, weekStart: '2026-11-16', amount: 2500, paidAt: '2026-11-20T10:00:00Z', paidByName: 'Beto', mine: true },
        ],
      },
    })
    expect(rpc).toHaveBeenCalledWith('group_fund', { p_group_id: G })
  })

  it('an empty fund is real zeros that the database said, with empty lists', async () => {
    rpc.mockResolvedValue({ data: fundJson({ totals: { registered: 0, paid: 0, pending: 0 }, people: [], debts: [] }), error: null })
    expect(await data.loadGroupFund(G)).toEqual({
      ok: true,
      data: { totals: { registered: 0, paid: 0, pending: 0 }, people: [], debts: [] },
    })
  })

  it('keeps null avatar fields', async () => {
    rpc.mockResolvedValue({ data: fundJson({ people: [{ ...person({ avatar_path: null, avatar_preset: 3 }), pending: 1 }], debts: [] }), error: null })
    const r = await data.loadGroupFund(G)
    expect(r.ok && r.data.people[0]).toMatchObject({ avatarPath: null, avatarPreset: 3 })
  })

  it.each([
    ['null payload', null],
    ['missing totals', { people: [], debts: [] }],
    ['a total as a string', fundJson({ totals: { registered: '7500', paid: 0, pending: 0 } })],
    ['a missing total (never zero by default)', fundJson({ totals: { registered: 7500, paid: 2500 } })],
    ['a null total', fundJson({ totals: { registered: null, paid: 0, pending: 0 } })],
    ['a negative total', fundJson({ totals: { registered: 10, paid: -1, pending: 0 } })],
    ['people not a list', fundJson({ people: 'x' })],
    ['a person without pending', fundJson({ people: [person()] })],
    ['a debt without an id', fundJson({ debts: [debtJson({ debt_id: undefined })] })],
    ['a debt with a bad amount', fundJson({ debts: [debtJson({ amount: 'mucho' })] })],
    ['a debt with mine of the wrong type', fundJson({ debts: [debtJson({ mine: 1 })] })],
    ['a debt with paid_at of the wrong type', fundJson({ debts: [debtJson({ paid_at: 5 })] })],
  ])('a malformed payload (%s) is an error state, never zeros', async (_n, payload) => {
    rpc.mockResolvedValue({ data: payload, error: null })
    const r = await data.loadGroupFund(G)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/^No pudimos cargar/)
  })

  it('a database error is an error state', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect((await data.loadGroupFund(G)).ok).toBe(false)
  })

  it('a thrown call is an error state', async () => {
    rpc.mockRejectedValue(new Error('x'))
    expect((await data.loadGroupFund(G)).ok).toBe(false)
  })

  it('a stranger gets not found; an invalid id makes no call', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'group_not_found' } })
    expect(await data.loadGroupFund(G)).toMatchObject({ ok: false, notFound: true })
    rpc.mockClear()
    expect(await data.loadGroupFund('x')).toMatchObject({ ok: false, notFound: true })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('loadMyFundDebts', () => {
  const mine = (over: Record<string, unknown> = {}) => ({
    owed: [{ group_id: G, group_name: 'Gym', pending: 3000 }],
    administered: [{ group_id: F, group_name: 'Lectura', pending: 12000 }],
    ...over,
  })

  it('maps owed and administered', async () => {
    rpc.mockResolvedValue({ data: mine(), error: null })
    expect(await data.loadMyFundDebts()).toEqual({
      ok: true,
      data: {
        owed: [{ groupId: G, groupName: 'Gym', pending: 3000 }],
        administered: [{ groupId: F, groupName: 'Lectura', pending: 12000 }],
      },
    })
    expect(rpc).toHaveBeenCalledWith('my_fund_debts')
  })

  it('both lists empty is a valid answer', async () => {
    rpc.mockResolvedValue({ data: { owed: [], administered: [] }, error: null })
    expect(await data.loadMyFundDebts()).toEqual({ ok: true, data: { owed: [], administered: [] } })
  })

  it.each([
    ['null', null],
    ['no owed', { administered: [] }],
    ['owed not a list', mine({ owed: {} })],
    ['a row without a group name', mine({ owed: [{ group_id: G, pending: 1 }] })],
    ['a row with a bad group id', mine({ owed: [{ group_id: 'x', group_name: 'Gym', pending: 1 }] })],
    ['a row with a string amount', mine({ administered: [{ group_id: F, group_name: 'L', pending: '9' }] })],
    ['a row with a negative amount', mine({ administered: [{ group_id: F, group_name: 'L', pending: -9 }] })],
  ])('a malformed payload (%s) is an error state', async (_n, payload) => {
    rpc.mockResolvedValue({ data: payload, error: null })
    const r = await data.loadMyFundDebts()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/^No pudimos cargar/)
  })

  it('a failed or thrown call is an error state', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect((await data.loadMyFundDebts()).ok).toBe(false)
    rpc.mockRejectedValue(new Error('x'))
    expect((await data.loadMyFundDebts()).ok).toBe(false)
  })

  it('a signed-out caller is told to sign in', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_authenticated' } })
    expect(await data.loadMyFundDebts()).toEqual({ ok: false, error: 'Inicia sesión para continuar.' })
  })
})

describe('loadGroupRejected', () => {
  const item = (over: Record<string, unknown> = {}) => ({
    checkin_id: C,
    local_date: '2026-11-22',
    photo_path: 'u/p.jpg',
    reason: 'Foto borrosa',
    rejected_by_name: 'Beto',
    rejected_at: '2026-11-22T20:00:00Z',
    ...person(),
    ...over,
  })

  it('maps the rejected photos', async () => {
    rpc.mockResolvedValue({ data: [item(), item({ checkin_id: D, photo_path: null })], error: null })
    expect(await data.loadGroupRejected(G)).toEqual({
      ok: true,
      data: [
        { ...PERSON, checkinId: C, localDate: '2026-11-22', photoPath: 'u/p.jpg', reason: 'Foto borrosa', rejectedByName: 'Beto', rejectedAt: '2026-11-22T20:00:00Z' },
        { ...PERSON, checkinId: D, localDate: '2026-11-22', photoPath: null, reason: 'Foto borrosa', rejectedByName: 'Beto', rejectedAt: '2026-11-22T20:00:00Z' },
      ],
    })
    expect(rpc).toHaveBeenCalledWith('group_rejected_checkins', { p_group_id: G })
  })

  it('an empty list is valid', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    expect(await data.loadGroupRejected(G)).toEqual({ ok: true, data: [] })
  })

  it.each([
    ['null', null],
    ['an object', {}],
    ['an item without a reason', [item({ reason: undefined })]],
    ['an item with a numeric reason', [item({ reason: 4 })]],
    ['an item without a checkin id', [item({ checkin_id: undefined })]],
    ['an item without a date', [item({ local_date: null })]],
    ['an item that is not an object', ['x']],
  ])('a malformed payload (%s) is an error state', async (_n, payload) => {
    rpc.mockResolvedValue({ data: payload, error: null })
    const r = await data.loadGroupRejected(G)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/^No pudimos cargar/)
  })

  it('a failed call is an error state, a stranger is not found, an invalid id makes no call', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect((await data.loadGroupRejected(G)).ok).toBe(false)
    rpc.mockResolvedValue({ data: null, error: { message: 'not_group_member' } })
    expect(await data.loadGroupRejected(G)).toMatchObject({ ok: false, notFound: true })
    rpc.mockClear()
    expect(await data.loadGroupRejected('x')).toMatchObject({ ok: false, notFound: true })
    expect(rpc).not.toHaveBeenCalled()
  })
})
