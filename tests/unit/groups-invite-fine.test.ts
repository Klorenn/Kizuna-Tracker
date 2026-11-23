import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const createAdminClient = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClient() }))

import { loadInviteFine } from '@/lib/groups-invite-fine'

const CODE = 'K7QM4PXD'
function client(answer: { data?: unknown; error?: { message: string } | null } | Error) {
  const rpc = vi.fn(async () => {
    if (answer instanceof Error) throw answer
    return { data: answer.data ?? null, error: answer.error ?? null }
  })
  return { rpc }
}

describe('loadInviteFine', () => {
  beforeEach(() => {
    createAdminClient.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('a fine in force: amount and purpose, asked by code', async () => {
    const c = client({ data: { amount: 2500, purpose: 'Asado de fin de mes' } })
    expect(await loadInviteFine(CODE, c)).toEqual({ amount: 2500, purpose: 'Asado de fin de mes' })
    expect(c.rpc).toHaveBeenCalledWith('group_invite_fine_for', { p_code: CODE })
  })
  it('uses the service client when none is given', async () => {
    createAdminClient.mockReturnValue(client({ data: { amount: 100, purpose: 'x' } }))
    expect(await loadInviteFine(CODE)).toEqual({ amount: 100, purpose: 'x' })
  })
  it('null: no fine in force', async () => {
    expect(await loadInviteFine(CODE, client({ data: null }))).toBeNull()
  })
  it('a database error: no fine shown, logged, never thrown', async () => {
    expect(await loadInviteFine(CODE, client({ error: { message: 'boom' } }))).toBeNull()
    expect(console.error).toHaveBeenCalled()
  })
  it('an exception, or no service client: no fine shown', async () => {
    expect(await loadInviteFine(CODE, client(new Error('net')))).toBeNull()
    createAdminClient.mockImplementation(() => {
      throw new Error('no key')
    })
    expect(await loadInviteFine(CODE)).toBeNull()
    expect(console.error).toHaveBeenCalledTimes(2)
  })
  it.each([
    [{ amount: '2500', purpose: 'x' }],
    [{ amount: 2500.5, purpose: 'x' }],
    [{ amount: 0, purpose: 'x' }],
    [{ amount: 2500, purpose: '' }],
    [{ amount: 2500 }],
    [[1]],
    ['x'],
  ])('a malformed answer %j shows no fine', async (data) => {
    expect(await loadInviteFine(CODE, client({ data }))).toBeNull()
  })
  it('never logs the code', async () => {
    await loadInviteFine(CODE, client({ error: { message: `boom ${CODE}` } }))
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain(CODE)
  })
})
