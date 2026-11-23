import { beforeEach, describe, expect, it, vi } from 'vitest'

type Rpc = { name: string; args: Record<string, unknown> }
const rpcs: Rpc[] = []
let rpcResult: { data: unknown; error: { message: string } | null } = { data: null, error: null }
const revalidated: string[] = []

const client = {
  rpc: async (name: string, args: Record<string, unknown>) => {
    rpcs.push({ name, args })
    return rpcResult
  },
}

vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => client }))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidated.push(p) }))

import { deleteBodyWeight, logBodyWeight, setHeight } from '@/app/(app)/perfil/body-actions'

const ID = '55555555-5555-4555-8555-555555555555'

beforeEach(() => {
  rpcs.length = 0
  revalidated.length = 0
  rpcResult = { data: null, error: null }
})

describe('logBodyWeight', () => {
  it('accepts a comma and sends the number with a null date (today)', async () => {
    rpcResult = { data: ID, error: null }
    await expect(logBodyWeight({ kg: '72,4' })).resolves.toEqual({ ok: true, id: ID })
    expect(rpcs).toEqual([{ name: 'log_body_weight', args: { p_kg: 72.4, p_date: null } }])
  })

  it('accepts a point, a number and a past date', async () => {
    rpcResult = { data: ID, error: null }
    await logBodyWeight({ kg: 71.9, date: '2026-11-20' })
    await logBodyWeight({ kg: '72.25', date: '2026-11-19' })
    expect(rpcs.map((r) => r.args)).toEqual([
      { p_kg: 71.9, p_date: '2026-11-20' },
      { p_kg: 72.25, p_date: '2026-11-19' },
    ])
  })

  it.each(['', 'abc', '19,9', '401', '72,456', '-70'])('refuses %j without calling the database', async (kg) => {
    await expect(logBodyWeight({ kg })).resolves.toEqual({
      ok: false,
      error: 'Escribe un peso entre 20 y 400 kg.',
    })
    expect(rpcs).toHaveLength(0)
  })

  it('refuses a malformed date without calling the database', async () => {
    const r = await logBodyWeight({ kg: '72', date: '2026-02-30' })
    expect(r).toEqual({ ok: false, error: 'Elige una fecha válida.' })
    expect(rpcs).toHaveLength(0)
  })

  it.each([
    ['weight_date_future', 'No puedes registrar el peso de una fecha futura.'],
    ['weight_date_too_old', 'Esa fecha es muy antigua. Elige una de los últimos 5 años.'],
    ['invalid_weight', 'Escribe un peso entre 20 y 400 kg.'],
    ['not_authenticated', 'Inicia sesión para continuar.'],
  ])('maps %s to neutral copy', async (code, copy) => {
    rpcResult = { data: null, error: { message: code } }
    await expect(logBodyWeight({ kg: '72' })).resolves.toEqual({ ok: false, error: copy })
  })

  it('never leaks a raw database message', async () => {
    rpcResult = { data: null, error: { message: 'duplicate key value violates constraint "x"' } }
    await expect(logBodyWeight({ kg: '72' })).resolves.toEqual({
      ok: false,
      error: 'No pudimos guardar el cambio. Inténtalo de nuevo.',
    })
  })

  it('refreshes Perfil and Resumen on success', async () => {
    rpcResult = { data: ID, error: null }
    await logBodyWeight({ kg: '72' })
    expect(revalidated).toEqual(['/perfil', '/resumen'])
  })
})

describe('deleteBodyWeight', () => {
  it('deletes by id', async () => {
    rpcResult = { data: true, error: null }
    await expect(deleteBodyWeight(ID)).resolves.toEqual({ ok: true })
    expect(rpcs).toEqual([{ name: 'delete_body_weight', args: { p_id: ID } }])
    expect(revalidated).toEqual(['/perfil', '/resumen'])
  })

  it('reports an entry that was already gone', async () => {
    rpcResult = { data: false, error: null }
    await expect(deleteBodyWeight(ID)).resolves.toEqual({ ok: false, error: 'Ese registro ya no existe.' })
  })

  it('refuses a non-uuid id without calling the database', async () => {
    await expect(deleteBodyWeight('x')).resolves.toEqual({ ok: false, error: 'Ese registro ya no existe.' })
    expect(rpcs).toHaveLength(0)
  })

  it('maps not_authenticated', async () => {
    rpcResult = { data: null, error: { message: 'not_authenticated' } }
    await expect(deleteBodyWeight(ID)).resolves.toEqual({ ok: false, error: 'Inicia sesión para continuar.' })
  })
})

describe('setHeight', () => {
  it('saves cm with comma or point', async () => {
    await expect(setHeight('172,5')).resolves.toEqual({ ok: true })
    await setHeight(180)
    expect(rpcs.map((r) => r.args)).toEqual([{ p_cm: 172.5 }, { p_cm: 180 }])
    expect(rpcs[0].name).toBe('set_height')
  })

  it('clears with null or an empty string', async () => {
    await setHeight(null)
    await setHeight('  ')
    expect(rpcs.map((r) => r.args)).toEqual([{ p_cm: null }, { p_cm: null }])
  })

  it.each(['79', '251', 'abc', '172,55', '-5'])('refuses %j without calling the database', async (cm) => {
    await expect(setHeight(cm)).resolves.toEqual({ ok: false, error: 'Escribe una altura entre 80 y 250 cm.' })
    expect(rpcs).toHaveLength(0)
  })

  it('maps invalid_height and not_authenticated', async () => {
    rpcResult = { data: null, error: { message: 'invalid_height' } }
    await expect(setHeight('172')).resolves.toEqual({ ok: false, error: 'Escribe una altura entre 80 y 250 cm.' })
    rpcResult = { data: null, error: { message: 'not_authenticated' } }
    await expect(setHeight('172')).resolves.toEqual({ ok: false, error: 'Inicia sesión para continuar.' })
  })
})
