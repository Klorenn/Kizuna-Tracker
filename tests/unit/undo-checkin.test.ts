import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { undoCheckinCore } from '@/lib/undo-checkin'

type R = { data?: unknown; error?: { message: string } | null }
type Fake = { reads: Record<string, R>; ops: { table: string; op: string; eqs: Record<string, unknown> }[] }

function fake(reads: Record<string, R>): { client: SupabaseClient<Database>; log: Fake } {
  const log: Fake = { reads, ops: [] }
  const from = (table: string) => {
    const start = (op: string) => {
      const entry = { table, op, eqs: {} as Record<string, unknown> }
      log.ops.push(entry)
      const c: Record<string, unknown> = {}
      c.eq = (k: string, v: unknown) => ((entry.eqs[k] = v), c)
      for (const m of ['is', 'limit', 'select']) c[m] = () => c
      const result = () => reads[`${table}.${op}`] ?? { data: null, error: null }
      c.maybeSingle = async () => result()
      c.then = (res: (v: unknown) => unknown) => res(result())
      return c
    }
    return { select: () => start('select'), delete: () => start('delete') }
  }
  return { client: { from } as unknown as SupabaseClient<Database>, log }
}

const OWN = { data: { id: 'h1', log_type: 'none', quantity_unit: null, visibility: 'friends' }, error: null }
const base = (): Record<string, R> => ({
  'habits.select': OWN,
  'profiles.select': { data: { timezone: 'America/Santiago' }, error: null },
  'habit_items.select': { data: [], error: null },
  'checkins.select': { data: { photo_path: null }, error: null },
  'checkins.delete': { data: [{ id: 'c1' }], error: null },
})
const NOW = new Date('2026-03-10T15:00:00Z')

describe('undoCheckinCore', () => {
  it('deletes today\'s plain check-in using the profile time zone date', async () => {
    const { client, log } = fake(base())
    await expect(undoCheckinCore(client, 'u1', 'h1', NOW)).resolves.toEqual({ ok: true })
    const del = log.ops.find((o) => o.op === 'delete')
    expect(del?.eqs).toEqual({ habit_id: 'h1', local_date: '2026-03-10' })
  })
  it('foreign or missing habit is not found', async () => {
    const r = base()
    r['habits.select'] = { data: null, error: null }
    const { client } = fake(r)
    await expect(undoCheckinCore(client, 'u1', 'h1', NOW)).resolves.toEqual({ ok: false, error: 'No encontramos ese hábito.' })
  })
  it('missing profile asks to sign in', async () => {
    const r = base()
    r['profiles.select'] = { data: null, error: null }
    const { client } = fake(r)
    await expect(undoCheckinCore(client, 'u1', 'h1', NOW)).resolves.toEqual({ ok: false, error: 'Inicia sesión para continuar.' })
  })
  it('refuses habits with steps and photo check-ins without deleting', async () => {
    const a = base()
    a['habit_items.select'] = { data: [{ id: 'i' }], error: null }
    const fa = fake(a)
    await expect(undoCheckinCore(fa.client, 'u1', 'h1', NOW)).resolves.toEqual({ ok: false, error: 'No puedes deshacer este registro.' })
    const b = base()
    b['checkins.select'] = { data: { photo_path: 'u/c.jpg' }, error: null }
    const fb = fake(b)
    await expect(undoCheckinCore(fb.client, 'u1', 'h1', NOW)).resolves.toEqual({ ok: false, error: 'No puedes deshacer este registro.' })
    expect([...fa.log.ops, ...fb.log.ops].some((o) => o.op === 'delete')).toBe(false)
  })
  it('read errors give the generic copy', async () => {
    const a = base()
    a['habit_items.select'] = { data: null, error: { message: 'x' } }
    await expect(undoCheckinCore(fake(a).client, 'u1', 'h1', NOW)).resolves.toMatchObject({ ok: false, error: 'No pudimos guardar los cambios. Inténtalo de nuevo.' })
    const b = base()
    b['checkins.select'] = { data: null, error: { message: 'x' } }
    await expect(undoCheckinCore(fake(b).client, 'u1', 'h1', NOW)).resolves.toMatchObject({ ok: false, error: 'No pudimos guardar los cambios. Inténtalo de nuevo.' })
  })
  it('maps delete errors and an empty delete', async () => {
    const a = base()
    a['checkins.delete'] = { data: null, error: { message: 'quantity_checkin_managed' } }
    await expect(undoCheckinCore(fake(a).client, 'u1', 'h1', NOW)).resolves.toEqual({ ok: false, error: 'Un hábito de cantidad se deshace quitando sumas.' })
    const b = base()
    b['checkins.delete'] = { data: [], error: null }
    await expect(undoCheckinCore(fake(b).client, 'u1', 'h1', NOW)).resolves.toEqual({ ok: false, error: 'Hoy no hay un registro que deshacer.' })
  })
})
