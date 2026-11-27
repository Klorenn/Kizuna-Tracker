import { describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { SIGNUP_METADATA_KEYS, supabaseDeleteDeps } from '@/lib/delete-account-deps'

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown[]][] }

/** Records every query; each builder is awaitable and resolves with `reads[table]` for selects. */
function fakeAdmin(reads: Record<string, unknown> = {}) {
  const calls: Call[] = []
  const auth = { updateUserById: vi.fn(async () => ({ error: null })), signOut: vi.fn(async () => ({ error: null })) }
  const storageCalls: { bucket: string; op: string; prefix?: string }[] = []
  const client = {
    auth: { admin: auth },
    storage: {
      from(bucket: string) {
        return {
          async list(prefix: string) {
            storageCalls.push({ bucket, op: 'list', prefix })
            return { data: [], error: null }
          },
          async remove() {
            storageCalls.push({ bucket, op: 'remove' })
            return { data: null, error: null }
          },
        }
      },
    },
    from(table: string) {
      const make = (op: string, payload?: unknown) => {
        const call: Call = { table, op, payload, filters: [] }
        calls.push(call)
        const b: Record<string, unknown> = {}
        for (const f of ['eq', 'in', 'not', 'or', 'is']) {
          b[f] = (...args: unknown[]) => {
            call.filters.push([f, args])
            return b
          }
        }
        b.then = (res: (v: unknown) => unknown) => res({ data: reads[`${table}.${op}`] ?? [], error: null })
        return b
      }
      return {
        select: () => make('select'),
        delete: () => make('delete'),
        update: (p: unknown) => make('update', p),
      }
    },
  }
  return { client, calls, auth, storageCalls }
}

const UID = 'u1'

describe('supabaseDeleteDeps', () => {
  test('conserva photo_path de los check-ins de hábitos en retos (no los modifica)', async () => {
    const { client, calls } = fakeAdmin({
      'habits.select': [{ id: 'h1' }, { id: 'h2' }],
      'challenges.select': [{ creator_habit_id: 'h1', rival_habit_id: 'x' }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deps = supabaseDeleteDeps(client as any)
    await deps.deleteRows('checkins', UID)
    expect(calls.filter((c) => c.table === 'checkins' && c.op === 'update')).toEqual([])
    const del = calls.find((c) => c.table === 'checkins' && c.op === 'delete')!
    expect(del.filters).toContainEqual(['not', ['habit_id', 'in', '(h1)']])
  })

  test('los hábitos en retos se archivan y renombran; los demás se borran', async () => {
    const { client, calls } = fakeAdmin({
      'habits.select': [{ id: 'h1' }, { id: 'h2' }],
      'challenges.select': [{ creator_habit_id: 'h1', rival_habit_id: 'x' }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabaseDeleteDeps(client as any).deleteRows('habits', UID)
    const upd = calls.find((c) => c.table === 'habits' && c.op === 'update')!
    expect(upd.payload).toMatchObject({ name: 'Hábito', visibility: 'private' })
    expect(upd.filters).toContainEqual(['in', ['id', ['h1']]])
  })

  test('un hábito que solo está en un sub-reto (ítem 2) también se conserva archivado', async () => {
    const { client, calls } = fakeAdmin({
      'habits.select': [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }],
      'challenges.select': [{ creator_habit_id: 'h1', rival_habit_id: 'x' }],
      'challenge_items.select': [{ creator_habit_id: 'y', rival_habit_id: 'h2' }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deps = supabaseDeleteDeps(client as any)
    await deps.deleteRows('habits', UID)
    const del = calls.find((c) => c.table === 'habits' && c.op === 'delete')!
    expect(del.filters).toContainEqual(['not', ['id', 'in', '(h1,h2)']])
    const upd = calls.find((c) => c.table === 'habits' && c.op === 'update')!
    expect(upd.filters).toContainEqual(['in', ['id', ['h1', 'h2']]])
    // the item read is scoped to the user's habits, both sides
    const q = calls.find((c) => c.table === 'challenge_items' && c.op === 'select')!
    expect(q.filters).toContainEqual(['or', ['creator_habit_id.in.(h1,h2,h3),rival_habit_id.in.(h1,h2,h3)']])
  })

  test('los check-ins de hábitos solo presentes en un sub-reto no se borran', async () => {
    const { client, calls } = fakeAdmin({
      'habits.select': [{ id: 'h2' }],
      'challenge_items.select': [{ creator_habit_id: null, rival_habit_id: 'h2' }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabaseDeleteDeps(client as any).deleteRows('checkins', UID)
    const del = calls.find((c) => c.table === 'checkins' && c.op === 'delete')!
    expect(del.filters).toContainEqual(['not', ['habit_id', 'in', '(h2)']])
  })

  test('borra las filas propias de registros detallados y peso por user_id', async () => {
    const { client, calls } = fakeAdmin()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deps = supabaseDeleteDeps(client as any)
    for (const t of ['workout_sets', 'workout_sessions', 'reading_entries', 'books', 'exercises', 'body_weights'] as const) {
      await deps.deleteRows(t, UID)
    }
    const dels = calls.filter((c) => c.op === 'delete')
    expect(dels.map((c) => c.table)).toEqual([
      'workout_sets',
      'workout_sessions',
      'reading_entries',
      'books',
      'exercises',
      'body_weights',
    ])
    // exercises: only the user's own (the catalog rows have user_id null and are never touched)
    for (const d of dels) expect(d.filters).toEqual([['eq', ['user_id', UID]]])
  })

  test('scrubProfile guarda height_cm en null junto al resto del perfil', async () => {
    const { client, calls } = fakeAdmin()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabaseDeleteDeps(client as any).scrubProfile(UID, {
      username: 'deleted_x',
      first_name: 'Cuenta',
      last_name: 'eliminada',
      birth_date: null,
      avatar_path: null,
      height_cm: null,
      deleted_at: '2026-11-25T12:00:00.000Z',
    })
    const upd = calls.find((c) => c.table === 'profiles' && c.op === 'update')!
    expect(upd.payload).toMatchObject({ height_cm: null })
    expect(upd.filters).toContainEqual(['eq', ['id', UID]])
  })

  test('limpia todas las claves de metadata del registro con null', async () => {
    const { client, auth } = fakeAdmin()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabaseDeleteDeps(client as any).banAndFreeEmail(UID, 'x@invalid.kizuna')
    const payload = (auth.updateUserById.mock.calls[0] as unknown[])[1] as { user_metadata: Record<string, unknown> }
    expect(Object.keys(payload.user_metadata).sort()).toEqual([...SIGNUP_METADATA_KEYS].sort())
    expect(Object.values(payload.user_metadata).every((v) => v === null)).toBe(true)
    expect(payload).toMatchObject({ email: 'x@invalid.kizuna', ban_duration: '876000h' })
  })

  test('las claves coinciden con las que envía el registro', async () => {
    const src = (await import('node:fs')).readFileSync('src/app/(auth)/registro/actions.ts', 'utf8')
    for (const k of SIGNUP_METADATA_KEYS) expect(src).toContain(`${k}:`)
  })

  test('revoca todas las sesiones con el token del usuario', async () => {
    const { client, auth } = fakeAdmin()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabaseDeleteDeps(client as any, 'jwt-123').revokeSessions(UID)
    expect(auth.signOut).toHaveBeenCalledWith('jwt-123', 'global')
  })

  test('purgeSocial borra tokens y códigos de emparejamiento del widget por user_id', async () => {
    const { client, calls, storageCalls } = fakeAdmin()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deps = supabaseDeleteDeps(client as any)
    await deps.purgeSocial(UID)
    for (const table of ['widget_tokens', 'widget_pairing_codes']) {
      const del = calls.find((c) => c.table === table && c.op === 'delete')
      expect(del, table).toBeDefined()
      expect(del!.filters).toContainEqual(['eq', ['user_id', UID]])
    }
    const outings = calls.find((c) => c.table === 'outings' && c.op === 'delete')
    expect(outings!.filters).toContainEqual(['eq', ['owner_id', UID]])
    const inviteAt = calls.findIndex((c) => c.table === 'outing_invites' && c.op === 'delete')
    const outingAt = calls.findIndex((c) => c.table === 'outings' && c.op === 'delete')
    expect(inviteAt).toBeGreaterThanOrEqual(0)
    expect(outingAt).toBeGreaterThan(inviteAt)
    expect(calls[inviteAt]!.filters).toContainEqual(['eq', ['invitee_id', UID]])
    const tripAt = calls.findIndex((c) => c.table === 'trips' && c.op === 'delete')
    expect(tripAt).toBeGreaterThan(outingAt)
    expect(calls[tripAt]!.filters).toContainEqual(['eq', ['owner_id', UID]])
    expect(storageCalls).toContainEqual({ bucket: 'outing-photos', op: 'list', prefix: UID })
  })
})
