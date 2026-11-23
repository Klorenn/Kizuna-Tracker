import { describe, expect, it, vi } from 'vitest'
import * as rpcs from '@/lib/groups-rpc'

const G = '11111111-1111-4111-8111-111111111111'
const U = '22222222-2222-4222-8222-222222222222'
const H = '33333333-3333-4333-8333-333333333333'

function client(answer: unknown = { data: null, error: null }) {
  const rpc = vi.fn().mockResolvedValue(answer)
  return { rpc }
}

describe('groups-rpc: one function per RPC, exact names and arguments', () => {
  const cases: [string, (c: ReturnType<typeof client>) => Promise<unknown>, string, Record<string, unknown> | undefined][] = [
    [
      'createGroup',
      (c) =>
        rpcs.createGroup(c, {
          name: 'Gym',
          icon: 'barbell',
          color: 'indigo',
          description: null,
          commitmentName: 'Ir',
          commitmentIcon: 'barbell',
          targetPerWeek: 3,
          requiresPhoto: true,
          habitId: H,
        }),
      'create_group',
      {
        p_name: 'Gym',
        p_icon: 'barbell',
        p_color: 'indigo',
        p_description: null,
        p_commitment_name: 'Ir',
        p_commitment_icon: 'barbell',
        p_target_per_week: 3,
        p_requires_photo: true,
        p_habit_id: H,
      },
    ],
    ['updateGroup', (c) => rpcs.updateGroup(c, G, { name: 'N', icon: 'i', color: 'c', description: null }), 'update_group', { p_group_id: G, p_name: 'N', p_icon: 'i', p_color: 'c', p_description: null }],
    [
      'setGroupCommitment',
      (c) => rpcs.setGroupCommitment(c, G, { name: 'N', icon: 'i', targetPerWeek: 4, requiresPhoto: false }),
      'set_group_commitment',
      { p_group_id: G, p_commitment_name: 'N', p_commitment_icon: 'i', p_target_per_week: 4, p_requires_photo: false },
    ],
    ['archiveGroup', (c) => rpcs.archiveGroup(c, G), 'archive_group', { p_group_id: G }],
    ['createGroupInvite', (c) => rpcs.createGroupInvite(c, G), 'create_group_invite', { p_group_id: G }],
    ['groupInvitePreview', (c) => rpcs.groupInvitePreview(c, 'abc'), 'group_invite_preview', { p_code: 'abc' }],
    ['joinGroup', (c) => rpcs.joinGroup(c, 'abc', H), 'join_group', { p_code: 'abc', p_habit_id: H }],
    ['leaveGroup', (c) => rpcs.leaveGroup(c, G), 'leave_group', { p_group_id: G }],
    ['removeGroupMember', (c) => rpcs.removeGroupMember(c, G, U), 'remove_group_member', { p_group_id: G, p_user_id: U }],
    ['setGroupAdmin', (c) => rpcs.setGroupAdmin(c, G, U, true), 'set_group_admin', { p_group_id: G, p_user_id: U, p_admin: true }],
    ['myGroups', (c) => rpcs.myGroups(c), 'my_groups', undefined],
    ['groupDetail', (c) => rpcs.groupDetail(c, G), 'group_detail', { p_group_id: G }],
    ['groupBoard', (c) => rpcs.groupBoard(c, G), 'group_board', { p_group_id: G }],
    [
      'groupWall',
      (c) => rpcs.groupWall(c, G, { before: '2026-11-23T10:00:00Z', beforeId: H }, 21),
      'group_wall',
      { p_group_id: G, p_before: '2026-11-23T10:00:00Z', p_before_id: H, p_limit: 21 },
    ],
    ['groupHistory', (c) => rpcs.groupHistory(c, G, 12), 'group_history', { p_group_id: G, p_limit: 12 }],
    ['groupWeekDetail', (c) => rpcs.groupWeekDetail(c, G, '2026-11-16'), 'group_week_detail', { p_group_id: G, p_week_start: '2026-11-16' }],
    ['closeDueGroupWeeks', (c) => rpcs.closeDueGroupWeeks(c), 'close_due_group_weeks', undefined],
  ]

  it.each(cases)('%s calls %s', async (_n, run, name, args) => {
    const c = client()
    await run(c)
    expect(c.rpc).toHaveBeenCalledTimes(1)
    if (args === undefined) expect(c.rpc).toHaveBeenCalledWith(name)
    else expect(c.rpc).toHaveBeenCalledWith(name, args)
  })

  it('the first wall page sends null cursors', async () => {
    const c = client()
    await rpcs.groupWall(c, G, null, 21)
    expect(c.rpc).toHaveBeenCalledWith('group_wall', { p_group_id: G, p_before: null, p_before_id: null, p_limit: 21 })
  })

  it('returns data and error untouched', async () => {
    const err = { message: 'group_full', code: 'P0001' }
    expect(await rpcs.joinGroup(client({ data: null, error: err }), 'abc', H)).toEqual({ data: null, error: err })
    expect(await rpcs.leaveGroup(client({ data: null, error: null }), G)).toEqual({ data: null, error: null })
  })
})

describe('closeDueGroupWeeks with an abort signal', () => {
  it('hands the signal to the query builder', async () => {
    const signal = new AbortController().signal
    const builder: { abortSignal: ReturnType<typeof vi.fn>; then: (r: (v: unknown) => unknown) => unknown } = {
      abortSignal: vi.fn(() => builder),
      then: (r) => r({ data: 2, error: null }),
    }
    const rpc = vi.fn(() => builder)
    expect(await rpcs.closeDueGroupWeeks({ rpc }, signal)).toEqual({ data: 2, error: null })
    expect(rpc).toHaveBeenCalledWith('close_due_group_weeks')
    expect(builder.abortSignal).toHaveBeenCalledWith(signal)
  })
})

describe('isMissingFunction', () => {
  it('recognises "function does not exist" in its three spellings', () => {
    expect(rpcs.isMissingFunction({ code: 'PGRST202', message: 'Could not find the function public.close_due_group_weeks' })).toBe(true)
    expect(rpcs.isMissingFunction({ code: '42883', message: 'function public.close_due_group_weeks(timestamp with time zone) does not exist' })).toBe(true)
    expect(rpcs.isMissingFunction({ message: 'function close_due_group_weeks() does not exist' })).toBe(true)
  })
  it('is false for any other failure', () => {
    expect(rpcs.isMissingFunction({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false)
    expect(rpcs.isMissingFunction(null)).toBe(false)
    expect(rpcs.isMissingFunction(undefined)).toBe(false)
  })
})
