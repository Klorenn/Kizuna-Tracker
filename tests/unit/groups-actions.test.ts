import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GroupDraft } from '@/lib/groups-contract'

type Result = { data?: unknown; error?: { message: string; code?: string } | null }
const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const G = '33333333-3333-4333-8333-333333333333'
const NEW_HABIT = '55555555-5555-4555-8555-555555555555'
const OWN_HABIT = '66666666-6666-4666-8666-666666666666'
const CODE = 'K7QM4PXD'

const rpc = vi.fn()
const lookupInvite = vi.fn()
const createHabit = vi.fn()
const revalidatePath = vi.fn()
let log: string[] = []
let deleteResult: Result = { data: [{ id: NEW_HABIT }], error: null }
let deleteEqs: [string, unknown][] = []
let signedIn = true
let adminUsed = false

const client = {
  rpc: (...a: unknown[]) => {
    log.push(`rpc:${String(a[0])}`)
    return rpc(...a)
  },
  from: (table: string) => ({
    select: () => {
      throw new Error(`no direct select on ${table}`)
    },
    insert: () => {
      throw new Error(`no insert on ${table}`)
    },
    update: () => {
      throw new Error(`no update on ${table}`)
    },
    delete: () => {
      log.push(`${table}.delete`)
      const c: Record<string, unknown> = {}
      c.eq = (col: string, val: unknown) => {
        deleteEqs.push([col, val])
        return c
      }
      c.select = () => c
      c.then = (res: (v: unknown) => unknown) => res(deleteResult)
      return c
    },
  }),
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
vi.mock('@/lib/groups-invite-server', () => ({
  JOIN_LIMIT: { limit: 10, windowSeconds: 3600 },
  joinInviteKey: (id: string) => `gjoin:user:${id}`,
  lookupInvite: (...a: unknown[]) => {
    log.push('lookup')
    return lookupInvite(...a)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'kizuna.test' }) }))
vi.mock('@/app/(app)/habitos/actions', () => ({
  createHabit: (...a: unknown[]) => {
    log.push('createHabit')
    return createHabit(...a)
  },
}))

import * as actions from '@/app/(app)/grupos/actions'

const GENERIC = 'No pudimos completar la acción. Inténtalo de nuevo.'
const SIGN_IN = 'Inicia sesión para continuar.'

const draft = (over: Partial<GroupDraft> = {}): GroupDraft => ({
  name: 'Gym de los lunes',
  icon: 'barbell',
  color: 'rosa',
  description: '',
  commitment: { name: 'Ir al gym', icon: 'barbell', targetPerWeek: 3, requiresPhoto: false },
  habit: { kind: 'create' },
  ...over,
})
const summary = (over: Record<string, unknown> = {}) => ({
  id: G,
  name: 'Gym',
  icon: 'barbell',
  color: 'rosa',
  role: 'admin',
  member_count: 1,
  commitment_name: 'Ir al gym',
  commitment_icon: 'barbell',
  target_per_week: 3,
  requires_photo: false,
  my_habit_id: NEW_HABIT,
  my_done: 0,
  my_counts: true,
  complied_count: 0,
  counted_count: 1,
  streak: 0,
  archived: false,
  ...over,
})

const PREVIEW = {
  name: 'Gym',
  icon: 'barbell',
  color: 'rosa',
  commitment: { name: 'Ir al gym', icon: 'barbell', targetPerWeek: 3, requiresPhoto: false },
  memberCount: 3,
  full: false,
}
const found = (over: Record<string, unknown> = {}, memberGroupId: string | null = null) => ({
  kind: 'found',
  data: { preview: { ...PREVIEW, ...over }, memberGroupId },
})

/** Answers by RPC name; a missing name answers `{ data: null, error: null }`. */
function answers(map: Record<string, Result | ((args: unknown) => Result)>) {
  const all: Record<string, Result | ((args: unknown) => Result)> = { ...map }
  rpc.mockImplementation(async (name: string, args: unknown) => {
    const a = all[name]
    if (!a) return { data: null, error: null }
    return typeof a === 'function' ? a(args) : a
  })
}
const revalidated = () => revalidatePath.mock.calls.map((c) => c[0] as string).sort()

beforeEach(() => {
  rpc.mockReset()
  lookupInvite.mockReset()
  lookupInvite.mockResolvedValue(found())
  createHabit.mockReset()
  createHabit.mockResolvedValue({ ok: true, id: NEW_HABIT })
  revalidatePath.mockReset()
  log = []
  deleteResult = { data: [{ id: NEW_HABIT }], error: null }
  deleteEqs = []
  signedIn = true
  adminUsed = false
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://kizuna.example')
  rpc.mockResolvedValue({ data: null, error: null })
})

// every action, the same security properties ---------------------------------------------------------------------------

const ALL: [string, () => Promise<unknown>][] = [
  ['create', () => actions.create(draft())],
  ['update', () => actions.update(G, { name: 'Gym', icon: 'barbell', color: 'rosa', description: '' })],
  ['setCommitment', () => actions.setCommitment(G, { name: 'Gym', icon: 'barbell', targetPerWeek: 3, requiresPhoto: false })],
  ['archive', () => actions.archive(G)],
  ['createInvite', () => actions.createInvite(G)],
  ['join', () => actions.join(CODE, { kind: 'create' })],
  ['leave', () => actions.leave(G)],
  ['removeMember', () => actions.removeMember(G, OTHER)],
  ['setAdmin', () => actions.setAdmin(G, OTHER, true)],
  ['loadMoreWall', () => actions.loadMoreWall(G, { before: '2026-11-22T10:00:00Z', beforeId: OTHER })],
  ['loadWeek', () => actions.loadWeek(G, '2026-11-16')],
]

describe.each(ALL)('%s: calls requireUser first', (_name, run) => {
  it('refuses without a session before any validation, read or write', async () => {
    signedIn = false
    await expect(run()).resolves.toEqual({ ok: false, error: SIGN_IN })
    expect(log).toEqual(['requireUser'])
    expect(createHabit).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('never uses the service role', async () => {
    answers({
      create_group: { data: G },
      join_group: { data: G },
      create_group_invite: { data: CODE },
      set_group_commitment: { data: '2026-11-30' },
      group_wall: { data: [] },
      group_week_detail: { data: [] },
    })
    await run()
    expect(adminUsed).toBe(false)
  })
})

describe('the module exports exactly the GroupActions members', () => {
  it('has the eleven actions as functions', () => {
    expect(Object.keys(actions).sort()).toEqual(
      ['archive', 'create', 'createInvite', 'join', 'leave', 'loadMoreWall', 'loadWeek', 'removeMember', 'setAdmin', 'setCommitment', 'update'].sort(),
    )
    for (const f of Object.values(actions)) expect(typeof f).toBe('function')
  })
})

// create ---------------------------------------------------------------------------------------------------------------

describe('create', () => {
  it('"Crear «compromiso»": makes the habit first, then the group with it, and returns the group id', async () => {
    answers({ create_group: { data: G } })
    await expect(actions.create(draft())).resolves.toEqual({ ok: true, data: { id: G } })
    expect(log).toEqual(['requireUser', 'createHabit', 'rpc:create_group'])
    expect(createHabit).toHaveBeenCalledWith({
      name: 'Ir al gym',
      icon: 'barbell',
      frequency: { type: 'weekly', target: 3 },
      requiresPhoto: false,
      items: [],
      visibility: 'friends',
      preset: null,
      color: 'rosa',
      logType: 'none',
      quantity: null,
    })
    expect(rpc).toHaveBeenCalledWith('create_group', {
      p_name: 'Gym de los lunes',
      p_icon: 'barbell',
      p_color: 'rosa',
      p_description: null,
      p_commitment_name: 'Ir al gym',
      p_commitment_icon: 'barbell',
      p_target_per_week: 3,
      p_requires_photo: false,
      p_habit_id: NEW_HABIT,
    })
  })

  it('the habit copies the commitment: every day, with photo', async () => {
    answers({ create_group: { data: G } })
    await actions.create(draft({ commitment: { name: 'Correr', icon: 'sneaker-move', targetPerWeek: 7, requiresPhoto: true } }))
    expect(createHabit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Correr', frequency: { type: 'daily' }, requiresPhoto: true, icon: 'sneaker-move' }))
  })

  it('trims text and sends the description when there is one', async () => {
    answers({ create_group: { data: G } })
    await actions.create(draft({ name: '  Gym  ', description: ' Lunes a viernes ' }))
    expect(rpc).toHaveBeenCalledWith('create_group', expect.objectContaining({ p_name: 'Gym', p_description: 'Lunes a viernes' }))
  })

  it('"Usar uno de mis hábitos": no habit is created and the chosen one is linked; Hoy is revalidated once, by this action', async () => {
    answers({ create_group: { data: G } })
    await expect(actions.create(draft({ habit: { kind: 'habit', habitId: OWN_HABIT } }))).resolves.toEqual({ ok: true, data: { id: G } })
    expect(createHabit).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('create_group', expect.objectContaining({ p_habit_id: OWN_HABIT }))
    expect(revalidated()).toEqual(['/', '/grupos', `/grupos/${G}`])
  })

  it('with a new habit, createHabit already revalidated Hoy: only the group pages are revalidated here (no double render)', async () => {
    answers({ create_group: { data: G } })
    await actions.create(draft())
    expect(revalidated()).toEqual(['/grupos', `/grupos/${G}`])
  })

  describe('validation happens on the server, before anything is created', () => {
    const bad: [string, GroupDraft, string][] = [
      ['short name', draft({ name: 'ab' }), 'El nombre debe tener entre 3 y 40 letras.'],
      ['long name', draft({ name: 'x'.repeat(41) }), 'El nombre debe tener entre 3 y 40 letras.'],
      ['empty commitment', draft({ commitment: { name: ' ', icon: 'barbell', targetPerWeek: 3, requiresPhoto: false } }), 'Escribe el compromiso del grupo.'],
      ['target 0', draft({ commitment: { name: 'x', icon: 'barbell', targetPerWeek: 0, requiresPhoto: false } }), 'Elige entre 1 y 7 veces por semana.'],
      ['target 8', draft({ commitment: { name: 'x', icon: 'barbell', targetPerWeek: 8, requiresPhoto: false } }), 'Elige entre 1 y 7 veces por semana.'],
      ['unknown icon', draft({ icon: 'skull' }), 'Revisa los datos del grupo.'],
      ['unknown colour', draft({ color: 'neon' }), 'Revisa los datos del grupo.'],
      ['habit id not a uuid', draft({ habit: { kind: 'habit', habitId: 'x' } }), 'Revisa los datos del grupo.'],
    ]
    it.each(bad)('%s', async (_n, d, error) => {
      await expect(actions.create(d)).resolves.toEqual({ ok: false, error })
      expect(createHabit).not.toHaveBeenCalled()
      expect(rpc).not.toHaveBeenCalled()
    })
    it('a non-object draft', async () => {
      await expect(actions.create(null as never)).resolves.toEqual({ ok: false, error: 'Revisa los datos del grupo.' })
      expect(createHabit).not.toHaveBeenCalled()
    })
  })

  it('stops with the habit error when the habit cannot be created; no group call', async () => {
    createHabit.mockResolvedValue({ ok: false, error: 'Ponle un nombre al hábito.' })
    await expect(actions.create(draft())).resolves.toEqual({ ok: false, error: 'Ponle un nombre al hábito.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  describe('when the group call fails after the habit was created', () => {
    it('re-reads first: if the group exists with that habit, it is a success and nothing is deleted', async () => {
      answers({ create_group: { data: null, error: { message: 'fetch failed' } }, my_groups: { data: [summary({ id: G, my_habit_id: NEW_HABIT })] } })
      await expect(actions.create(draft())).resolves.toEqual({ ok: true, data: { id: G } })
      expect(log).not.toContain('habits.delete')
      expect(log.indexOf('rpc:my_groups')).toBeGreaterThan(log.indexOf('rpc:create_group'))
    })

    it('an answer without a group id counts as lost: it re-reads too', async () => {
      answers({ create_group: { data: 'not-a-uuid' }, my_groups: { data: [summary()] } })
      await expect(actions.create(draft())).resolves.toEqual({ ok: true, data: { id: G } })
      expect(log).not.toContain('habits.delete')
    })

    it('if no group links that habit, it deletes only the habit this call created, scoped by id and by the caller, and says why it failed', async () => {
      answers({ create_group: { data: null, error: { message: 'group_limit' } }, my_groups: { data: [summary({ my_habit_id: OWN_HABIT })] } })
      await expect(actions.create(draft())).resolves.toEqual({ ok: false, error: 'Ya estás en 10 grupos. Sal de uno para entrar a otro.' })
      expect(log.filter((l) => l === 'habits.delete')).toHaveLength(1)
      expect(deleteEqs).toEqual([
        ['id', NEW_HABIT],
        ['user_id', ME],
      ])
      expect(revalidated()).toContain('/')
    })

    it('a membership with ANOTHER habit does not count as success', async () => {
      answers({ create_group: { data: null, error: { message: 'group_limit' } }, my_groups: { data: [summary({ my_habit_id: OWN_HABIT })] } })
      const r = await actions.create(draft())
      expect(r.ok).toBe(false)
    })

    it('if the re-read itself fails, it deletes nothing and tells the person which habit was created', async () => {
      answers({ create_group: { data: null, error: { message: 'fetch failed' } }, my_groups: { data: null, error: { message: 'boom' } } })
      const r = await actions.create(draft())
      expect(r).toEqual({
        ok: false,
        error: 'No pudimos confirmar el grupo. Creamos «Ir al gym» en tus hábitos; revisa Grupos antes de reintentar.',
      })
      expect(log).not.toContain('habits.delete')
    })

    it('an unreadable re-read (not a list) also deletes nothing', async () => {
      answers({ create_group: { data: null, error: { message: 'x' } }, my_groups: { data: null, error: null } })
      const r = await actions.create(draft())
      expect(r.ok).toBe(false)
      expect(log).not.toContain('habits.delete')
    })

    it.each([
      ['the delete errors', { data: null, error: { message: 'rls' } }],
      ['the delete removes nothing', { data: [], error: null }],
    ])('if %s, it says the habit stays', async (_n, result) => {
      deleteResult = result as Result
      answers({ create_group: { data: null, error: { message: 'group_limit' } }, my_groups: { data: [] } })
      await expect(actions.create(draft())).resolves.toEqual({
        ok: false,
        error: 'Ya estás en 10 grupos. Sal de uno para entrar a otro. Creamos «Ir al gym» en tus hábitos; puedes archivarlo.',
      })
    })

    it('never deletes anything when the person chose one of their own habits', async () => {
      answers({ create_group: { data: null, error: { message: 'habit_in_group' } } })
      await expect(actions.create(draft({ habit: { kind: 'habit', habitId: OWN_HABIT } }))).resolves.toEqual({
        ok: false,
        error: 'Ese hábito ya está en un grupo.',
      })
      expect(log).not.toContain('habits.delete')
      expect(log).not.toContain('rpc:my_groups')
    })
  })

  it.each([
    ['invalid_group', 'Revisa los datos del grupo.'],
    ['group_limit', 'Ya estás en 10 grupos. Sal de uno para entrar a otro.'],
    ['habit_not_eligible', 'Ese hábito no sirve para este grupo.'],
    ['habit_in_group', 'Ese hábito ya está en un grupo.'],
    ['not_authenticated', SIGN_IN],
  ])('maps %s with a chosen habit', async (code, error) => {
    answers({ create_group: { data: null, error: { message: code } } })
    await expect(actions.create(draft({ habit: { kind: 'habit', habitId: OWN_HABIT } }))).resolves.toEqual({ ok: false, error })
  })

  it('never surfaces a raw database error', async () => {
    answers({ create_group: { data: null, error: { message: 'permission denied for table groups (42501)' } } })
    const r = await actions.create(draft({ habit: { kind: 'habit', habitId: OWN_HABIT } }))
    expect(r).toEqual({ ok: false, error: GENERIC })
  })
})

describe('an exception inside create/join is the generic retry copy, after the same re-read and clean-up decision', () => {
  it('createHabit throwing: generic copy, no group call', async () => {
    createHabit.mockRejectedValue(new Error('cookies'))
    await expect(actions.create(draft())).resolves.toEqual({ ok: false, error: GENERIC })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('the group call throwing after the habit exists: re-reads, and a membership with that habit is a success', async () => {
    answers({ create_group: () => { throw new Error('socket') }, my_groups: { data: [summary()] } })
    await expect(actions.create(draft())).resolves.toEqual({ ok: true, data: { id: G } })
    expect(log).not.toContain('habits.delete')
  })

  it('the group call throwing with no membership: deletes the habit created here (scoped) and returns the generic copy', async () => {
    answers({ join_group: () => { throw new Error('socket') }, my_groups: { data: [] } })
    await expect(actions.join(CODE, { kind: 'create' })).resolves.toEqual({ ok: false, error: GENERIC })
    expect(deleteEqs).toEqual([['id', NEW_HABIT], ['user_id', ME]])
  })

  it('the re-read throwing deletes nothing and says which habit exists', async () => {
    answers({ create_group: () => { throw new Error('socket') }, my_groups: () => { throw new Error('socket') } })
    const r = await actions.create(draft())
    expect(!r.ok && r.error).toContain('Creamos «Ir al gym» en tus hábitos')
    expect(log).not.toContain('habits.delete')
  })

  it('the delete throwing says the habit stays', async () => {
    answers({ create_group: { data: null, error: { message: 'group_limit' } }, my_groups: { data: [] } })
    deleteResult = new Proxy({}, { get: () => { throw new Error('boom') } }) as Result
    const r = await actions.create(draft())
    expect(!r.ok && r.error).toBe('Ya estás en 10 grupos. Sal de uno para entrar a otro. Creamos «Ir al gym» en tus hábitos; puedes archivarlo.')
  })

  it('a chosen habit and a throwing call: generic copy, nothing deleted', async () => {
    answers({ create_group: () => { throw new Error('socket') } })
    await expect(actions.create(draft({ habit: { kind: 'habit', habitId: OWN_HABIT } }))).resolves.toEqual({ ok: false, error: GENERIC })
    expect(log).not.toContain('habits.delete')
  })
})

// join -----------------------------------------------------------------------------------------------------------------

describe('join', () => {
  it('"Crear": habit first, then join_group with the code and that habit', async () => {
    answers({ join_group: { data: G } })
    await expect(actions.join(CODE, { kind: 'create' })).resolves.toEqual({ ok: true, data: { id: G } })
    expect(log).toEqual(['requireUser', 'lookup', 'createHabit', 'rpc:join_group'])
    // the lookup is counted per person (10 per hour) and the viewer is the session's, never the request's
    expect(lookupInvite).toHaveBeenCalledWith(expect.objectContaining({ code: CODE, viewerId: ME, key: `gjoin:user:${ME}`, limit: 10, windowSeconds: 3600 }))
    expect(rpc).toHaveBeenCalledWith('join_group', { p_code: CODE, p_habit_id: NEW_HABIT })
    expect(revalidated()).toEqual(['/grupos', `/grupos/${G}`])
  })

  it('the new habit is built from the commitment the invitation shows (read through the preview), never from the client', async () => {
    lookupInvite.mockResolvedValue(found({ color: 'salvia', commitment: { name: 'Correr', icon: 'sneaker-move', targetPerWeek: 7, requiresPhoto: true } }))
    answers({
      join_group: { data: G },
    })
    await actions.join(CODE, { kind: 'create' })
    expect(createHabit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Correr', icon: 'sneaker-move', frequency: { type: 'daily' }, requiresPhoto: true, color: 'salvia' }),
    )
  })

  it.each(['k7qm4pxd', 'K7QM-4PXD', ' k7qm 4pxd '])('a code typed as %j is normalised before the database sees it', async (typed) => {
    answers({ join_group: { data: G } })
    await actions.join(typed, { kind: 'habit', habitId: OWN_HABIT })
    expect(rpc).toHaveBeenCalledWith('join_group', { p_code: CODE, p_habit_id: OWN_HABIT })
  })

  it('a link that no longer works stops before creating a habit', async () => {
    lookupInvite.mockResolvedValue({ kind: 'gone' })
    await expect(actions.join(CODE, { kind: 'create' })).resolves.toEqual({ ok: false, error: 'Este enlace ya no sirve. Pide uno nuevo.' })
    expect(createHabit).not.toHaveBeenCalled()
  })

  it('a full group stops before creating a habit', async () => {
    lookupInvite.mockResolvedValue(found({ memberCount: 50, full: true }))
    await expect(actions.join(CODE, { kind: 'create' })).resolves.toEqual({ ok: false, error: 'Este grupo está completo.' })
    expect(createHabit).not.toHaveBeenCalled()
  })

  it('if the preview cannot be read, it fails without creating a habit', async () => {
    lookupInvite.mockResolvedValue({ kind: 'failed' })
    await expect(actions.join(CODE, { kind: 'create' })).resolves.toEqual({ ok: false, error: GENERIC })
    expect(createHabit).not.toHaveBeenCalled()
  })

  it('over the attempt limit: the limiter copy, and no habit is created', async () => {
    lookupInvite.mockResolvedValue({ kind: 'blocked' })
    await expect(actions.join(CODE, { kind: 'create' })).resolves.toEqual({ ok: false, error: 'Demasiados intentos. Prueba de nuevo en unos minutos.' })
    expect(createHabit).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('the person is already a member (the database says so): that copy, no habit, no join', async () => {
    lookupInvite.mockResolvedValue(found({}, G))
    await expect(actions.join(CODE, { kind: 'create' })).resolves.toEqual({ ok: false, error: 'Ya eres parte de este grupo.' })
    expect(createHabit).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('join_group answers NULL (no exception): the link no longer works', async () => {
    answers({ join_group: { data: null, error: null }, my_groups: { data: [] } })
    await expect(actions.join(CODE, { kind: 'habit', habitId: OWN_HABIT })).resolves.toEqual({ ok: false, error: 'Este enlace ya no sirve. Pide uno nuevo.' })
    expect(log).not.toContain('habits.delete')
  })

  it('join_group answers NULL after "Crear": the same copy, and the habit this call made is cleaned up', async () => {
    answers({ join_group: { data: null, error: null }, my_groups: { data: [] } })
    await expect(actions.join(CODE, { kind: 'create' })).resolves.toEqual({ ok: false, error: 'Este enlace ya no sirve. Pide uno nuevo.' })
    expect(log).toContain('habits.delete')
  })

  it('with a chosen habit: no preview, no creation, Hoy revalidated once', async () => {
    answers({ join_group: { data: G } })
    await expect(actions.join(CODE, { kind: 'habit', habitId: OWN_HABIT })).resolves.toEqual({ ok: true, data: { id: G } })
    expect(log).toEqual(['requireUser', 'rpc:join_group'])
    expect(rpc).toHaveBeenCalledWith('join_group', { p_code: CODE, p_habit_id: OWN_HABIT })
    expect(revalidated()).toEqual(['/', '/grupos', `/grupos/${G}`])
  })

  it.each(['', 'short', "'; drop table groups; --------", 'x'.repeat(300), 5, null])('refuses a code with the wrong shape: %j', async (code) => {
    await expect(actions.join(code as string, { kind: 'create' })).resolves.toEqual({ ok: false, error: 'Este enlace ya no sirve. Pide uno nuevo.' })
    expect(rpc).not.toHaveBeenCalled()
    expect(createHabit).not.toHaveBeenCalled()
  })

  it('refuses a malformed habit choice', async () => {
    await expect(actions.join(CODE, { kind: 'habit', habitId: 'x' })).resolves.toEqual({ ok: false, error: 'Revisa los datos del grupo.' })
    await expect(actions.join(CODE, undefined as never)).resolves.toEqual({ ok: false, error: 'Revisa los datos del grupo.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['invite_not_found', 'Este enlace ya no sirve. Pide uno nuevo.'],
    ['invite_expired', 'Este enlace ya no sirve. Pide uno nuevo.'],
    ['too_many_attempts', 'Demasiados intentos. Prueba de nuevo en unos minutos.'],
    ['group_full', 'Este grupo está completo.'],
    ['group_limit', 'Ya estás en 10 grupos. Sal de uno para entrar a otro.'],
    ['already_member', 'Ya eres parte de este grupo.'],
    ['habit_not_eligible', 'Ese hábito no sirve para este grupo.'],
    ['habit_in_group', 'Ese hábito ya está en un grupo.'],
    ['group_archived', 'Este grupo está archivado.'],
    ['something_else', GENERIC],
  ])('maps %s', async (code, error) => {
    answers({ join_group: { data: null, error: { message: code } } })
    await expect(actions.join(CODE, { kind: 'habit', habitId: OWN_HABIT })).resolves.toEqual({ ok: false, error })
  })

  describe('"Crear" and the join fails', () => {
    it('re-reads; if the membership exists with that habit, success without deleting', async () => {
      answers({ join_group: { data: null, error: { message: 'fetch failed' } }, my_groups: { data: [summary({ my_habit_id: NEW_HABIT })] } })
      await expect(actions.join(CODE, { kind: 'create' })).resolves.toEqual({ ok: true, data: { id: G } })
      expect(log).not.toContain('habits.delete')
    })

    it('otherwise deletes the habit this call created (scoped) and explains the failure', async () => {
      answers({ join_group: { data: null, error: { message: 'already_member' } }, my_groups: { data: [summary({ my_habit_id: OWN_HABIT })] } })
      await expect(actions.join(CODE, { kind: 'create' })).resolves.toEqual({ ok: false, error: 'Ya eres parte de este grupo.' })
      expect(deleteEqs).toEqual([
        ['id', NEW_HABIT],
        ['user_id', ME],
      ])
    })

    it('a failed re-read keeps the habit and says so', async () => {
      answers({ join_group: { data: null, error: { message: 'x' } }, my_groups: { data: null, error: { message: 'boom' } } })
      const r = await actions.join(CODE, { kind: 'create' })
      expect(r.ok).toBe(false)
      expect(!r.ok && r.error).toContain('Creamos «Ir al gym» en tus hábitos')
      expect(log).not.toContain('habits.delete')
    })

    it('a failed delete says the habit stays', async () => {
      deleteResult = { data: [], error: null }
      answers({ join_group: { data: null, error: { message: 'group_full' } }, my_groups: { data: [] } })
      const r = await actions.join(CODE, { kind: 'create' })
      expect(!r.ok && r.error).toBe('Este grupo está completo. Creamos «Ir al gym» en tus hábitos; puedes archivarlo.')
    })
  })
})

// update / commitment / archive ----------------------------------------------------------------------------------------

describe('update', () => {
  const fields = { name: ' Gym ', icon: 'barbell', color: 'rosa', description: '' }

  it('sends the trimmed fields and revalidates the group and the list', async () => {
    await expect(actions.update(G, fields)).resolves.toEqual({ ok: true, data: undefined })
    expect(rpc).toHaveBeenCalledWith('update_group', { p_group_id: G, p_name: 'Gym', p_icon: 'barbell', p_color: 'rosa', p_description: null })
    expect(revalidated()).toEqual(['/', '/grupos', `/grupos/${G}`])
  })

  it('validates id and fields first', async () => {
    await expect(actions.update('x', fields)).resolves.toEqual({ ok: false, error: 'No encontramos ese grupo.' })
    await expect(actions.update(G, { ...fields, name: 'a' })).resolves.toEqual({ ok: false, error: 'El nombre debe tener entre 3 y 40 letras.' })
    await expect(actions.update(G, { ...fields, description: 'x'.repeat(141) })).resolves.toEqual({
      ok: false,
      error: 'La descripción puede tener hasta 140 letras.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['not_group_admin', 'Solo un administrador puede hacer eso.'],
    ['group_not_found', 'No encontramos ese grupo.'],
    ['group_archived', 'Este grupo está archivado.'],
    ['invalid_group', 'Revisa los datos del grupo.'],
    ['weird', GENERIC],
  ])('maps %s and revalidates nothing', async (code, error) => {
    answers({ update_group: { data: null, error: { message: code } } })
    await expect(actions.update(G, fields)).resolves.toEqual({ ok: false, error })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('setCommitment', () => {
  const k = { name: ' Correr ', icon: 'sneaker-move', targetPerWeek: 4, requiresPhoto: true }

  it('returns the Monday it takes effect', async () => {
    answers({ set_group_commitment: { data: '2026-11-30' } })
    await expect(actions.setCommitment(G, k)).resolves.toEqual({ ok: true, data: { effectiveFrom: '2026-11-30' } })
    expect(rpc).toHaveBeenCalledWith('set_group_commitment', {
      p_group_id: G,
      p_commitment_name: 'Correr',
      p_commitment_icon: 'sneaker-move',
      p_target_per_week: 4,
      p_requires_photo: true,
    })
    expect(revalidated()).toEqual([`/grupos/${G}`])
  })

  it('an answer that is not a date is a failure, not a success', async () => {
    answers({ set_group_commitment: { data: 'soon' } })
    await expect(actions.setCommitment(G, k)).resolves.toEqual({ ok: false, error: GENERIC })
  })

  it('validates', async () => {
    await expect(actions.setCommitment(G, { ...k, targetPerWeek: 9 })).resolves.toEqual({ ok: false, error: 'Elige entre 1 y 7 veces por semana.' })
    await expect(actions.setCommitment(G, { ...k, name: '' })).resolves.toEqual({ ok: false, error: 'Escribe el compromiso del grupo.' })
    await expect(actions.setCommitment('x', k)).resolves.toEqual({ ok: false, error: 'No encontramos ese grupo.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps errors', async () => {
    answers({ set_group_commitment: { data: null, error: { message: 'not_group_admin' } } })
    await expect(actions.setCommitment(G, k)).resolves.toEqual({ ok: false, error: 'Solo un administrador puede hacer eso.' })
  })
})

describe('archive', () => {
  it('archives and revalidates the group and the list', async () => {
    await expect(actions.archive(G)).resolves.toEqual({ ok: true, data: undefined })
    expect(rpc).toHaveBeenCalledWith('archive_group', { p_group_id: G })
    expect(revalidated()).toEqual(['/', '/grupos', `/grupos/${G}`])
  })
  it('validates and maps', async () => {
    await expect(actions.archive('nope')).resolves.toEqual({ ok: false, error: 'No encontramos ese grupo.' })
    answers({ archive_group: { data: null, error: { message: 'not_group_admin' } } })
    await expect(actions.archive(G)).resolves.toEqual({ ok: false, error: 'Solo un administrador puede hacer eso.' })
  })
})

// invites --------------------------------------------------------------------------------------------------------------

describe('createInvite', () => {
  it('returns the code and the absolute URL on the site origin the app already uses', async () => {
    answers({ create_group_invite: { data: CODE } })
    await expect(actions.createInvite(G)).resolves.toEqual({
      ok: true,
      data: { code: CODE, url: `https://kizuna.example/g/${CODE}` },
    })
    expect(rpc).toHaveBeenCalledWith('create_group_invite', { p_group_id: G })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it.each(['k7qm4pxd', 'K7QM-4PXD', ' K7QM4PXD', 'K7QM4PXDD'])('what the database returns is never repaired: %j is a failure', async (returned) => {
    answers({ create_group_invite: { data: returned } })
    await expect(actions.createInvite(G)).resolves.toEqual({ ok: false, error: GENERIC })
  })

  it('falls back to the request host when no site URL is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    answers({ create_group_invite: { data: CODE } })
    const r = await actions.createInvite(G)
    expect(r).toEqual({ ok: true, data: { code: CODE, url: `https://kizuna.test/g/${CODE}` } })
  })

  it('a code of the wrong shape or no code is a failure (nothing is put in a URL)', async () => {
    answers({ create_group_invite: { data: '../../evil' } })
    await expect(actions.createInvite(G)).resolves.toEqual({ ok: false, error: GENERIC })
    answers({ create_group_invite: { data: null } })
    await expect(actions.createInvite(G)).resolves.toEqual({ ok: false, error: GENERIC })
  })

  it.each([
    ['not_group_admin', 'Solo un administrador puede hacer eso.'],
    ['group_full', 'Este grupo está completo.'],
    ['invite_limit', 'Ya hay 5 enlaces activos. Espera a que venza alguno.'],
    ['group_archived', 'Este grupo está archivado.'],
  ])('maps %s', async (code, error) => {
    answers({ create_group_invite: { data: null, error: { message: code } } })
    await expect(actions.createInvite(G)).resolves.toEqual({ ok: false, error })
  })

  it('validates the id', async () => {
    await expect(actions.createInvite('x')).resolves.toEqual({ ok: false, error: 'No encontramos ese grupo.' })
    expect(rpc).not.toHaveBeenCalled()
  })
})

// membership -----------------------------------------------------------------------------------------------------------

describe('leave', () => {
  it('leaves and revalidates the list and Hoy (the chip goes away), but not the page the leaver is on (no 404 flash)', async () => {
    await expect(actions.leave(G)).resolves.toEqual({ ok: true, data: undefined })
    expect(rpc).toHaveBeenCalledWith('leave_group', { p_group_id: G })
    expect(revalidated()).toEqual(['/', '/grupos'])
  })
  it('maps last_admin and validates', async () => {
    answers({ leave_group: { data: null, error: { message: 'last_admin' } } })
    await expect(actions.leave(G)).resolves.toEqual({ ok: false, error: 'Eres el único administrador. Nombra a otro antes de salir.' })
    expect(revalidatePath).not.toHaveBeenCalled()
    await expect(actions.leave('x')).resolves.toEqual({ ok: false, error: 'No encontramos ese grupo.' })
  })
})

describe('removeMember', () => {
  it('removes and revalidates the group and the list (member count)', async () => {
    await expect(actions.removeMember(G, OTHER)).resolves.toEqual({ ok: true, data: undefined })
    expect(rpc).toHaveBeenCalledWith('remove_group_member', { p_group_id: G, p_user_id: OTHER })
    expect(revalidated()).toEqual(['/grupos', `/grupos/${G}`])
  })
  it('refuses to remove oneself without asking the database', async () => {
    await expect(actions.removeMember(G, ME)).resolves.toEqual({ ok: false, error: 'Para salir, usa «Salir del grupo».' })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('validates ids and maps errors', async () => {
    await expect(actions.removeMember('x', OTHER)).resolves.toEqual({ ok: false, error: 'No encontramos ese grupo.' })
    await expect(actions.removeMember(G, 'x')).resolves.toEqual({ ok: false, error: GENERIC })
    expect(rpc).not.toHaveBeenCalled()
    answers({ remove_group_member: { data: null, error: { message: 'not_group_admin' } } })
    await expect(actions.removeMember(G, OTHER)).resolves.toEqual({ ok: false, error: 'Solo un administrador puede hacer eso.' })
  })
})

describe('setAdmin', () => {
  it.each([true, false])('sets admin=%s and revalidates the group only', async (admin) => {
    await expect(actions.setAdmin(G, OTHER, admin)).resolves.toEqual({ ok: true, data: undefined })
    expect(rpc).toHaveBeenCalledWith('set_group_admin', { p_group_id: G, p_user_id: OTHER, p_admin: admin })
    expect(revalidated()).toEqual([`/grupos/${G}`])
  })
  it('validates ids and the boolean', async () => {
    await expect(actions.setAdmin('x', OTHER, true)).resolves.toEqual({ ok: false, error: 'No encontramos ese grupo.' })
    await expect(actions.setAdmin(G, 'x', true)).resolves.toEqual({ ok: false, error: GENERIC })
    await expect(actions.setAdmin(G, OTHER, 'yes' as never)).resolves.toEqual({ ok: false, error: GENERIC })
    expect(rpc).not.toHaveBeenCalled()
  })
  it.each([
    ['admin_limit', 'Un grupo puede tener hasta 3 administradores.'],
    ['last_admin', 'Eres el único administrador. Nombra a otro antes de salir.'],
    ['not_group_member', 'No encontramos ese grupo.'],
    ['not_group_admin', 'Solo un administrador puede hacer eso.'],
  ])('maps %s', async (code, error) => {
    answers({ set_group_admin: { data: null, error: { message: code } } })
    await expect(actions.setAdmin(G, OTHER, true)).resolves.toEqual({ ok: false, error })
  })
})

// reads ----------------------------------------------------------------------------------------------------------------

describe('loadMoreWall', () => {
  const cursor = { before: '2026-11-22T10:00:00Z', beforeId: OTHER }
  const wallRow = (n: number) => ({
    user_id: OTHER,
    username: 'ana',
    display_name: 'Ana',
    avatar_path: null,
    avatar_preset: 2,
    checkin_id: `c${n}`,
    local_date: '2026-11-21',
    photo_path: null,
    created_at: `2026-11-21T10:0${n}:00Z`,
  })

  it('returns the next page and cursor, asking for one extra row, with the caller session', async () => {
    answers({ group_wall: { data: Array.from({ length: 21 }, (_, i) => wallRow(i % 10)) } })
    const r = await actions.loadMoreWall(G, cursor)
    expect(rpc).toHaveBeenCalledWith('group_wall', { p_group_id: G, p_before: cursor.before, p_before_id: OTHER, p_limit: 21 })
    expect(r.ok && r.data.items).toHaveLength(20)
    expect(r.ok && r.data.next).not.toBeNull()
  })

  it('refuses a malformed cursor without asking', async () => {
    for (const c of [null, {}, { before: 'yesterday', beforeId: OTHER }, { before: cursor.before, beforeId: 'x' }, { before: 5, beforeId: OTHER }]) {
      const r = await actions.loadMoreWall(G, c as never)
      expect(r.ok).toBe(false)
    }
    await expect(actions.loadMoreWall('x', cursor)).resolves.toEqual({ ok: false, error: 'No encontramos ese grupo.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('a failed read is an error, never an empty page', async () => {
    answers({ group_wall: { data: null, error: { message: 'boom' } } })
    await expect(actions.loadMoreWall(G, cursor)).resolves.toEqual({ ok: false, error: 'No pudimos cargar el muro. Inténtalo de nuevo.' })
  })

  it('a stranger gets the not-found copy', async () => {
    answers({ group_wall: { data: null, error: { message: 'group_not_found' } } })
    await expect(actions.loadMoreWall(G, cursor)).resolves.toEqual({ ok: false, error: 'No encontramos ese grupo.' })
  })
})

describe('loadWeek', () => {
  it('returns the members of the week', async () => {
    answers({
      group_week_detail: { data: [{ user_id: OTHER, username: 'ana', display_name: 'Ana', avatar_path: null, avatar_preset: 1, done: 3, target: 3, complied: true }] },
    })
    const r = await actions.loadWeek(G, '2026-11-16')
    expect(rpc).toHaveBeenCalledWith('group_week_detail', { p_group_id: G, p_week_start: '2026-11-16' })
    expect(r).toEqual({
      ok: true,
      data: [{ userId: OTHER, username: 'ana', displayName: 'Ana', avatarPath: null, avatarPreset: 1, done: 3, target: 3, complied: true }],
    })
  })
  it('refuses a week that is not a date', async () => {
    expect((await actions.loadWeek(G, '2026-02-30')).ok).toBe(false)
    expect((await actions.loadWeek(G, 'hoy')).ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('a failed read is an error', async () => {
    answers({ group_week_detail: { data: null, error: { message: 'boom' } } })
    await expect(actions.loadWeek(G, '2026-11-16')).resolves.toEqual({ ok: false, error: 'No pudimos cargar esa semana. Inténtalo de nuevo.' })
  })
})

// logging --------------------------------------------------------------------------------------------------------------

describe('personal data is never logged', () => {
  it('writes nothing to the console on failures', async () => {
    const spies = (['log', 'error', 'warn', 'info'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    answers({ create_group: { data: null, error: { message: 'boom ana@example.com' } }, my_groups: { data: [] } })
    await actions.create(draft())
    await actions.join(CODE, { kind: 'habit', habitId: OWN_HABIT })
    for (const s of spies) expect(s).not.toHaveBeenCalled()
    spies.forEach((s) => s.mockRestore())
  })
})
