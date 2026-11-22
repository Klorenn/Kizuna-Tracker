import { describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { SIGNUP_METADATA_KEYS, supabaseDeleteDeps } from '@/lib/delete-account-deps'

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown[]][] }

/** Records every query; each builder is awaitable and resolves with `reads[table]` for selects. */
function fakeAdmin(reads: Record<string, unknown> = {}) {
  const calls: Call[] = []
  const auth = { updateUserById: vi.fn(async () => ({ error: null })), signOut: vi.fn(async () => ({ error: null })) }
  const client = {
    auth: { admin: auth },
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
  return { client, calls, auth }
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
})
