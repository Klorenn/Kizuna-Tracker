import { beforeEach, describe, expect, it, vi } from 'vitest'

type Result = { data?: unknown; error?: { message: string } | null }
let reads: Record<string, Result> = {}
const updates: { table: string; payload: unknown }[] = []

function chain(result: () => Result) {
  const c: Record<string, unknown> = {}
  for (const m of ['eq', 'is', 'select', 'limit']) c[m] = () => c
  c.maybeSingle = async () => result()
  c.then = (res: (v: unknown) => unknown) => res(result())
  return c
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) },
  from: (table: string) => ({
    select: () => chain(() => reads[`${table}.select`] ?? { data: null, error: null }),
    update: (payload: unknown) => {
      updates.push({ table, payload })
      return chain(() => reads[`${table}.update`] ?? { data: [{ id: 'd1' }], error: null })
    },
  }),
}

vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => client }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setDebtPaid } from '@/app/(app)/deudas/actions'

const D1 = '44444444-4444-4444-8444-444444444444'

beforeEach(() => {
  reads = {}
  updates.length = 0
})

describe('setDebtPaid', () => {
  it('refuses when the caller is the debtor', async () => {
    reads['debts.select'] = { data: { creditor_id: 'juan', debtor_id: 'me' }, error: null }
    await expect(setDebtPaid(D1, true)).resolves.toEqual({
      ok: false,
      error: 'Solo quien cobra puede marcarla como pagada.',
    })
    expect(updates).toHaveLength(0)
  })

  it('marks paid when the caller is the creditor', async () => {
    reads['debts.select'] = { data: { creditor_id: 'me', debtor_id: 'juan' }, error: null }
    await expect(setDebtPaid(D1, true)).resolves.toEqual({ ok: true })
    expect(updates[0].table).toBe('debts')
    expect((updates[0].payload as { paid_at: string }).paid_at).toMatch(/^\d{4}-\d\d-\d\dT/)
  })

  it('unmarks with null', async () => {
    reads['debts.select'] = { data: { creditor_id: 'me', debtor_id: 'juan' }, error: null }
    await expect(setDebtPaid(D1, false)).resolves.toEqual({ ok: true })
    expect(updates[0].payload).toEqual({ paid_at: null })
  })

  it('rejects a malformed id', async () => {
    await expect(setDebtPaid('nope', true)).resolves.toMatchObject({ ok: false })
  })

  it('reports a debt that does not exist', async () => {
    reads['debts.select'] = { data: null, error: null }
    await expect(setDebtPaid(D1, true)).resolves.toMatchObject({ ok: false })
  })
})
