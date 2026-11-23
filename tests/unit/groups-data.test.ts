import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const rpc = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => ({ rpc }) }))

const data = await import('@/lib/groups-data')

const G = '11111111-1111-4111-8111-111111111111'
const H = '33333333-3333-4333-8333-333333333333'
const U = '22222222-2222-4222-8222-222222222222'
const CODE = '0123456789abcdef0123456789abcdef'

beforeEach(() => {
  rpc.mockReset()
})

const myRow = (over: Record<string, unknown> = {}) => ({
  id: G,
  name: 'Gym',
  icon: 'barbell',
  color: 'indigo',
  role: 'admin',
  member_count: 12,
  commitment_name: 'Ir al gym',
  commitment_icon: 'barbell',
  target_per_week: 3,
  requires_photo: true,
  my_habit_id: H,
  my_done: 2,
  my_counts: true,
  complied_count: 5,
  counted_count: 11,
  streak: 4,
  archived: false,
  ...over,
})

const person = (over: Record<string, unknown> = {}) => ({
  user_id: U,
  username: 'ana_g',
  display_name: 'Ana',
  avatar_path: 'u/a.png',
  avatar_preset: null,
  ...over,
})

describe('loadMyGroups', () => {
  it('maps my_groups rows to GroupSummary', async () => {
    rpc.mockResolvedValue({ data: [myRow()], error: null })
    const r = await data.loadMyGroups()
    expect(rpc).toHaveBeenCalledWith('my_groups')
    expect(r).toEqual({
      ok: true,
      data: [
        {
          id: G,
          name: 'Gym',
          icon: 'barbell',
          color: 'indigo',
          role: 'admin',
          memberCount: 12,
          commitment: { name: 'Ir al gym', icon: 'barbell', targetPerWeek: 3, requiresPhoto: true },
          myHabitId: H,
          myDone: 2,
          myCounts: true,
          compliedCount: 5,
          countedCount: 11,
          streak: 4,
          archived: false,
        },
      ],
    })
  })

  it('an empty list is an empty list', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    expect(await data.loadMyGroups()).toEqual({ ok: true, data: [] })
  })

  it('a group whose habit was deleted (archived group, my_habit_id null) loads with myHabitId null and does not break the list', async () => {
    rpc.mockResolvedValue({ data: [myRow(), myRow({ id: H, my_habit_id: null, archived: true })], error: null })
    const r = await data.loadMyGroups()
    if (!r.ok) throw new Error('expected ok')
    expect(r.data).toHaveLength(2)
    expect(r.data[1]).toMatchObject({ id: H, myHabitId: null, archived: true })
    expect(r.data[0].myHabitId).toBe(H)
  })

  it('a my_habit_id of the wrong type is still malformed', async () => {
    rpc.mockResolvedValue({ data: [myRow({ my_habit_id: 7 })], error: null })
    expect((await data.loadMyGroups()).ok).toBe(false)
  })

  it('a failed call is an error state, never an empty list', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom: secret detail' } })
    const r = await data.loadMyGroups()
    expect(r).toEqual({ ok: false, error: 'No pudimos cargar los grupos. Inténtalo de nuevo.' })
    expect(JSON.stringify(r)).not.toContain('secret')
  })

  it('a thrown call is an error state', async () => {
    rpc.mockRejectedValue(new Error('network'))
    expect(await data.loadMyGroups()).toEqual({ ok: false, error: 'No pudimos cargar los grupos. Inténtalo de nuevo.' })
  })

  it('no data and no error (not an array) is an error state', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect((await data.loadMyGroups()).ok).toBe(false)
  })

  it('a malformed row makes the whole read an error state', async () => {
    rpc.mockResolvedValue({ data: [myRow(), myRow({ member_count: 'many' })], error: null })
    expect((await data.loadMyGroups()).ok).toBe(false)
    rpc.mockResolvedValue({ data: [myRow({ role: 'owner' })], error: null })
    expect((await data.loadMyGroups()).ok).toBe(false)
    rpc.mockResolvedValue({ data: ['x'], error: null })
    expect((await data.loadMyGroups()).ok).toBe(false)
  })

  it('without a session says so', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_authenticated' } })
    expect(await data.loadMyGroups()).toEqual({ ok: false, error: 'Inicia sesión para continuar.' })
  })

  it('uses the client it is given', async () => {
    const own = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) }
    await data.loadMyGroups(own)
    expect(own.rpc).toHaveBeenCalledWith('my_groups')
    expect(rpc).not.toHaveBeenCalled()
  })
})

const detailRow = (over: Record<string, unknown> = {}) => ({
  id: G,
  name: 'Gym',
  icon: 'barbell',
  color: 'indigo',
  description: 'Lunes a viernes',
  commitment_name: 'Ir al gym',
  commitment_icon: 'barbell',
  target_per_week: 3,
  requires_photo: false,
  next_commitment_name: null,
  next_commitment_icon: null,
  next_target_per_week: null,
  next_requires_photo: null,
  next_effective_from: null,
  my_role: 'member',
  my_habit_id: H,
  streak: 0,
  member_count: 7,
  timezone: 'America/Santiago',
  archived_at: null,
  ...over,
})
/** group_detail is `returns table`: always a set. */
const detailRows = (over: Record<string, unknown> = {}) => [detailRow(over)]

describe('loadGroupDetail', () => {
  it('maps a row without pending change', async () => {
    rpc.mockResolvedValue({ data: detailRows(), error: null })
    const r = await data.loadGroupDetail(G)
    expect(rpc).toHaveBeenCalledWith('group_detail', { p_group_id: G })
    expect(r).toEqual({
      ok: true,
      data: {
        id: G,
        name: 'Gym',
        icon: 'barbell',
        color: 'indigo',
        description: 'Lunes a viernes',
        commitment: { name: 'Ir al gym', icon: 'barbell', targetPerWeek: 3, requiresPhoto: false },
        pendingCommitment: null,
        role: 'member',
        myHabitId: H,
        streak: 0,
        memberCount: 7,
        archived: false,
      },
    })
  })

  it('reads my_role exactly; a row without it is malformed', async () => {
    rpc.mockResolvedValue({ data: detailRows({ my_role: 'admin' }), error: null })
    const r = await data.loadGroupDetail(G)
    expect(r.ok && r.data.role).toBe('admin')
    rpc.mockResolvedValue({ data: detailRows({ my_role: undefined, role: 'admin' }), error: null })
    expect((await data.loadGroupDetail(G)).ok).toBe(false)
  })

  it('archived_at set means archived, null means live (the real column of group_detail)', async () => {
    rpc.mockResolvedValue({ data: detailRows({ archived_at: '2026-11-20T10:00:00+00:00' }), error: null })
    const archived = await data.loadGroupDetail(G)
    expect(archived.ok && archived.data.archived).toBe(true)
    rpc.mockResolvedValue({ data: detailRows({ archived_at: null }), error: null })
    const live = await data.loadGroupDetail(G)
    expect(live.ok && live.data.archived).toBe(false)
  })

  it('a group whose habit was deleted (my_habit_id null) still loads, with myHabitId null', async () => {
    rpc.mockResolvedValue({ data: detailRows({ my_habit_id: null, archived_at: '2026-11-20T10:00:00+00:00' }), error: null })
    const r = await data.loadGroupDetail(G)
    expect(r.ok && r.data.myHabitId).toBeNull()
  })

  it('maps the pending change', async () => {
    rpc.mockResolvedValue({
      data: detailRows({
        next_commitment_name: 'Correr',
        next_commitment_icon: 'sneaker-move',
        next_target_per_week: 4,
        next_requires_photo: true,
        next_effective_from: '2026-11-30',
      }),
      error: null,
    })
    const r = await data.loadGroupDetail(G)
    expect(r.ok && r.data.pendingCommitment).toEqual({
      name: 'Correr',
      icon: 'sneaker-move',
      targetPerWeek: 4,
      requiresPhoto: true,
      effectiveFrom: '2026-11-30',
    })
  })

  it('a null description stays null; an unreadable archived_at is malformed', async () => {
    rpc.mockResolvedValue({ data: detailRows({ description: null }), error: null })
    const r = await data.loadGroupDetail(G)
    expect(r.ok && r.data.description).toBeNull()
    rpc.mockResolvedValue({ data: detailRows({ archived_at: 5 }), error: null })
    expect((await data.loadGroupDetail(G)).ok).toBe(false)
  })

  it('group_not_found and not_group_member are the not-found state', async () => {
    for (const message of ['group_not_found', 'ERROR: not_group_member']) {
      rpc.mockResolvedValue({ data: null, error: { message } })
      expect(await data.loadGroupDetail(G)).toEqual({ ok: false, error: 'No encontramos ese grupo.', notFound: true })
    }
  })

  it('another failure is an error state without notFound', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } })
    const r = await data.loadGroupDetail(G)
    expect(r).toEqual({ ok: false, error: 'No pudimos cargar el grupo. Inténtalo de nuevo.' })
    expect('notFound' in r).toBe(false)
  })

  it('an empty answer for a group is not found', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    expect(await data.loadGroupDetail(G)).toEqual({ ok: false, error: 'No encontramos ese grupo.', notFound: true })
  })

  it('an id that is not a uuid is not found without asking', async () => {
    const r = await data.loadGroupDetail("x'; drop table groups;--")
    expect(r).toEqual({ ok: false, error: 'No encontramos ese grupo.', notFound: true })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('a half-pending change (some next_ columns missing) is malformed', async () => {
    rpc.mockResolvedValue({ data: detailRows({ next_effective_from: '2026-11-30', next_commitment_name: null }), error: null })
    expect((await data.loadGroupDetail(G)).ok).toBe(false)
  })
})

describe('loadGroupBoard', () => {
  const row = (over: Record<string, unknown> = {}) => ({ ...person(), role: 'member', joined_on: '2026-11-10', counts: true, done: 2, target: 3, ...over })

  it('maps one row per member', async () => {
    rpc.mockResolvedValue({ data: [row(), row({ user_id: H, counts: false, done: 0, avatar_path: null, avatar_preset: 4, role: 'admin' })], error: null })
    const r = await data.loadGroupBoard(G)
    expect(rpc).toHaveBeenCalledWith('group_board', { p_group_id: G })
    expect(r).toEqual({
      ok: true,
      data: [
        { userId: U, username: 'ana_g', displayName: 'Ana', avatarPath: 'u/a.png', avatarPreset: null, role: 'member', joinedOn: '2026-11-10', counts: true, done: 2, target: 3 },
        { userId: H, username: 'ana_g', displayName: 'Ana', avatarPath: null, avatarPreset: 4, role: 'admin', joinedOn: '2026-11-10', counts: false, done: 0, target: 3 },
      ],
    })
  })

  it('never carries more than the contract fields', async () => {
    rpc.mockResolvedValue({ data: [row({ email: 'a@b.c', habit_id: H, note: 'x' })], error: null })
    const r = await data.loadGroupBoard(G)
    expect(r.ok && Object.keys(r.data[0]).sort()).toEqual(
      ['avatarPath', 'avatarPreset', 'counts', 'displayName', 'done', 'joinedOn', 'role', 'target', 'userId', 'username'].sort(),
    )
  })

  it('not found and failures', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'group_not_found' } })
    expect(await data.loadGroupBoard(G)).toMatchObject({ ok: false, notFound: true })
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    expect(await data.loadGroupBoard(G)).toMatchObject({ ok: false, error: 'No pudimos cargar el tablero. Inténtalo de nuevo.' })
  })
})

describe('loadGroupWall', () => {
  const wall = (n: number) => ({ ...person(), checkin_id: `c-${n}`, local_date: '2026-11-22', photo_path: n % 2 ? 'p/x.jpg' : null, created_at: `2026-11-22T10:${String(59 - n).padStart(2, '0')}:00Z` })

  it('asks for limit + 1 on the first page and returns a cursor when there is more', async () => {
    rpc.mockResolvedValue({ data: Array.from({ length: 21 }, (_, i) => wall(i)), error: null })
    const r = await data.loadGroupWall(G)
    expect(rpc).toHaveBeenCalledWith('group_wall', { p_group_id: G, p_before: null, p_before_id: null, p_limit: 21 })
    if (!r.ok) throw new Error('expected ok')
    expect(r.data.items).toHaveLength(20)
    expect(r.data.next).toEqual({ before: r.data.items[19].createdAt, beforeId: 'c-19' })
    expect(r.data.items[0]).toEqual({
      userId: U,
      username: 'ana_g',
      displayName: 'Ana',
      avatarPath: 'u/a.png',
      avatarPreset: null,
      checkinId: 'c-0',
      localDate: '2026-11-22',
      photoPath: null,
      createdAt: '2026-11-22T10:59:00Z',
    })
    expect(r.data.items[1].photoPath).toBe('p/x.jpg')
  })

  it('no cursor on a short page', async () => {
    rpc.mockResolvedValue({ data: Array.from({ length: 20 }, (_, i) => wall(i)), error: null })
    const r = await data.loadGroupWall(G)
    expect(r.ok && r.data.next).toBeNull()
    expect(r.ok && r.data.items).toHaveLength(20)
  })

  it('passes the cursor on', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await data.loadGroupWall(G, { before: '2026-11-22T10:00:00Z', beforeId: H })
    expect(rpc).toHaveBeenCalledWith('group_wall', { p_group_id: G, p_before: '2026-11-22T10:00:00Z', p_before_id: H, p_limit: 21 })
  })

  it('clamps the page size so limit + 1 never exceeds the database maximum of 50', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await data.loadGroupWall(G, null, 500)
    expect(rpc).toHaveBeenCalledWith('group_wall', expect.objectContaining({ p_limit: 50 }))
    await data.loadGroupWall(G, null, 0)
    expect(rpc).toHaveBeenLastCalledWith('group_wall', expect.objectContaining({ p_limit: 2 }))
  })

  it('failures', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_group_member' } })
    expect(await data.loadGroupWall(G)).toMatchObject({ ok: false, notFound: true })
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    expect(await data.loadGroupWall(G)).toMatchObject({ ok: false, error: 'No pudimos cargar el muro. Inténtalo de nuevo.' })
  })
})

describe('loadGroupHistory', () => {
  it('maps closed weeks, keeping a null myComplied', async () => {
    rpc.mockResolvedValue({
      data: [
        { week_start: '2026-11-16', target_per_week: 3, requires_photo: false, members_counted: 10, members_complied: 6, my_complied: true },
        { week_start: '2026-11-09', target_per_week: 3, requires_photo: true, members_counted: 9, members_complied: 4, my_complied: null },
      ],
      error: null,
    })
    const r = await data.loadGroupHistory(G)
    expect(rpc).toHaveBeenCalledWith('group_history', { p_group_id: G, p_limit: 12 })
    expect(r).toEqual({
      ok: true,
      data: [
        { weekStart: '2026-11-16', targetPerWeek: 3, requiresPhoto: false, membersCounted: 10, membersComplied: 6, myComplied: true },
        { weekStart: '2026-11-09', targetPerWeek: 3, requiresPhoto: true, membersCounted: 9, membersComplied: 4, myComplied: null },
      ],
    })
  })

  it('failures', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'group_not_found' } })
    expect(await data.loadGroupHistory(G)).toMatchObject({ ok: false, notFound: true })
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    expect(await data.loadGroupHistory(G)).toMatchObject({ ok: false, error: 'No pudimos cargar las semanas anteriores. Inténtalo de nuevo.' })
  })
})

describe('loadGroupWeek', () => {
  it('maps the members of one closed week', async () => {
    rpc.mockResolvedValue({ data: [{ ...person(), done: 3, target: 3, complied: true }], error: null })
    const r = await data.loadGroupWeek(G, '2026-11-16')
    expect(rpc).toHaveBeenCalledWith('group_week_detail', { p_group_id: G, p_week_start: '2026-11-16' })
    expect(r).toEqual({
      ok: true,
      data: [{ userId: U, username: 'ana_g', displayName: 'Ana', avatarPath: 'u/a.png', avatarPreset: null, done: 3, target: 3, complied: true }],
    })
  })

  it('a week that is not a real date is refused without asking', async () => {
    for (const w of ['2026-13-01', '2026-02-30', 'hoy', '']) {
      const r = await data.loadGroupWeek(G, w)
      expect(r.ok).toBe(false)
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('failures', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'group_not_found' } })
    expect(await data.loadGroupWeek(G, '2026-11-16')).toMatchObject({ ok: false, notFound: true })
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    expect(await data.loadGroupWeek(G, '2026-11-16')).toMatchObject({ ok: false, error: 'No pudimos cargar esa semana. Inténtalo de nuevo.' })
  })
})

describe('loadInvitePreview', () => {
  const preview = (over: Record<string, unknown> = {}) => ({
    name: 'Gym',
    icon: 'barbell',
    color: 'indigo',
    commitment_name: 'Ir al gym',
    commitment_icon: 'barbell',
    target_per_week: 3,
    requires_photo: true,
    member_count: 12,
    full: false,
    ...over,
  })

  it('maps the preview', async () => {
    rpc.mockResolvedValue({ data: preview(), error: null })
    const r = await data.loadInvitePreview(CODE)
    expect(rpc).toHaveBeenCalledWith('group_invite_preview', { p_code: CODE })
    expect(r).toEqual({
      ok: true,
      data: {
        name: 'Gym',
        icon: 'barbell',
        color: 'indigo',
        commitment: { name: 'Ir al gym', icon: 'barbell', targetPerWeek: 3, requiresPhoto: true },
        memberCount: 12,
        full: false,
      },
    })
  })

  it('a code the database does not know (null) is ok with null data: the link no longer works', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await data.loadInvitePreview(CODE)).toEqual({ ok: true, data: null })
  })

  it('a code with the wrong shape never reaches the database', async () => {
    for (const code of ['', 'short', 'has spaces in it and more', "'; drop table--------", 'x'.repeat(200)]) {
      expect(await data.loadInvitePreview(code)).toEqual({ ok: true, data: null })
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('a failed call is an error state, not "the link is gone"', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } })
    expect(await data.loadInvitePreview(CODE)).toEqual({ ok: false, error: 'No pudimos cargar la invitación. Inténtalo de nuevo.' })
    rpc.mockRejectedValue(new Error('network'))
    expect((await data.loadInvitePreview(CODE)).ok).toBe(false)
  })

  it('a malformed preview is an error state', async () => {
    rpc.mockResolvedValue({ data: preview({ full: 'no' }), error: null })
    expect((await data.loadInvitePreview(CODE)).ok).toBe(false)
  })
})
