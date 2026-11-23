import { beforeEach, describe, expect, it, vi } from 'vitest'

const events: string[] = []
const { revalidatePath, rpc } = vi.hoisted(() => ({ revalidatePath: vi.fn(), rpc: vi.fn() }))
let deleteError: { message: string } | null = null

const tick = () => new Promise((r) => setTimeout(r, 0))
const ROWS: Record<string, unknown> = {
  habits: { data: { id: 'h1', log_type: 'none', quantity_unit: null, visibility: 'friends' }, error: null },
  profiles: { data: { timezone: 'America/Santiago' }, error: null },
  habit_items: { data: [], error: null },
  checkins: { data: null, error: null },
}

/** A read that takes one macrotask: `start` and `end` events show which reads overlap. */
function read(table: string) {
  const run = async () => {
    events.push(`start ${table}`)
    await tick()
    events.push(`end ${table}`)
    return ROWS[table]
  }
  const c: Record<string, unknown> = {}
  for (const m of ['eq', 'is', 'in', 'limit', 'select']) c[m] = () => c
  c.single = run
  c.maybeSingle = run
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej)
  return c
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  rpc,
  from: (table: string) => ({
    select: () => read(table),
    delete: () => {
      const c: Record<string, unknown> = {}
      c.eq = () => c
      c.then = (res: (v: unknown) => unknown) => res({ error: deleteError })
      return c
    },
  }),
}

vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => client }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { checkIn, undoCheckIn } from '@/app/(app)/habitos/actions'

beforeEach(() => {
  events.length = 0
  revalidatePath.mockReset()
  rpc.mockReset()
  deleteError = null
})

describe('check-in and undo revalidate only what changed', () => {
  it('a check-in revalidates Hoy once and that habit only, not every habit page', async () => {
    rpc.mockResolvedValue({ data: [{ checkin_id: 'c1', created: true }], error: null })
    await checkIn('h1')
    expect(revalidatePath.mock.calls).toEqual([['/'], ['/habitos/h1']])
  })

  it('an undo revalidates Hoy once and that habit only', async () => {
    await expect(undoCheckIn('h1')).resolves.toEqual({ ok: true })
    expect(revalidatePath.mock.calls).toEqual([['/'], ['/habitos/h1']])
  })

  it('a refused check-in or undo revalidates nothing', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'photo_required' } })
    await checkIn('h1')
    deleteError = { message: 'boom' }
    await undoCheckIn('h1')
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('undoCheckIn reads', () => {
  it('ownership, time zone and steps are read side by side, then today, then the delete', async () => {
    await undoCheckIn('h1')
    const firstEnd = events.findIndex((e) => e.startsWith('end'))
    expect(events.slice(0, firstEnd).sort()).toEqual(['start habit_items', 'start habits', 'start profiles'])
    // today's check-in needs the time zone, so it starts only after the profile arrived
    expect(events.indexOf('start checkins')).toBeGreaterThan(events.indexOf('end profiles'))
  })
})
