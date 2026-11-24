import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { supabaseWidgetDeps } from '@/lib/widget-deps'

const UID = '11111111-1111-4111-8111-111111111111'
type Call = { table: string; filters: [string, unknown[]][] }

function fakeAdmin(opts: { reads?: Record<string, { data: unknown; error: { message: string } | null }>; rpc?: (fn: string, args: unknown) => unknown } = {}) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const call: Call = { table, filters: [] }
      calls.push(call)
      const b: Record<string, unknown> = {}
      for (const f of ['eq', 'is', 'order']) {
        b[f] = (...args: unknown[]) => {
          call.filters.push([f, args])
          return b
        }
      }
      b.select = () => b
      b.then = (res: (v: unknown) => unknown) => res(opts.reads?.[table] ?? { data: [], error: null })
      return b
    },
    rpc: vi.fn(async (fn: string, args: unknown) => opts.rpc?.(fn, args) ?? { data: null, error: null }),
  }
  return { client, calls }
}

const NOW = new Date('2026-11-24T15:00:00Z')

describe('supabaseWidgetDeps.loadToday', () => {
  it('3 lecturas filtradas por user_id; payload con pendientes en orden y kinds', async () => {
    const { client, calls } = fakeAdmin({
      reads: {
        habits: {
          data: [
            { id: 'a', name: 'Agua', icon: 'drop', visibility: 'private', requires_photo: false, frequency_type: 'daily', target_per_week: null, log_type: 'none' },
            { id: 'b', name: 'Foto', icon: 'camera', visibility: 'private', requires_photo: true, frequency_type: 'daily', target_per_week: null, log_type: 'none' },
            { id: 'c', name: 'Hecho', icon: 'x', visibility: 'private', requires_photo: false, frequency_type: 'daily', target_per_week: null, log_type: 'none' },
          ],
          error: null,
        },
        habit_items: { data: [], error: null },
        checkins: { data: [{ habit_id: 'c' }], error: null },
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deps = supabaseWidgetDeps(client as any, () => NOW)
    const p = await deps.loadToday(UID, 'UTC')
    expect(p).toEqual({
      v: 1,
      date: '2026-11-24',
      timeZone: 'UTC',
      done: 1,
      total: 3,
      pending: 2,
      habits: [
        { id: 'a', name: 'Agua', kind: 'toggle' },
        { id: 'b', name: 'Foto', kind: 'open' },
      ],
    })
    expect(calls.map((c) => c.table).sort()).toEqual(['checkins', 'habit_items', 'habits'])
    for (const c of calls) expect(c.filters).toContainEqual(['eq', ['user_id', UID]])
    expect(calls.find((c) => c.table === 'checkins')!.filters).toContainEqual(['eq', ['local_date', '2026-11-24']])
  })
  it('usa el dia local de la zona del perfil', async () => {
    const { client, calls } = fakeAdmin()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabaseWidgetDeps(client as any, () => new Date('2026-11-24T02:00:00Z')).loadToday(UID, 'America/Santiago')
    expect(calls.find((c) => c.table === 'checkins')!.filters).toContainEqual(['eq', ['local_date', '2026-11-23']])
  })
  it('null si falla cualquier lectura', async () => {
    const { client } = fakeAdmin({ reads: { habit_items: { data: null, error: { message: 'x' } } } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await supabaseWidgetDeps(client as any, () => NOW).loadToday(UID, 'UTC')).toBeNull()
  })
})

describe('supabaseWidgetDeps rpc', () => {
  it('auth: llama widget_auth con hash, ip y scope; mapea ok', async () => {
    const { client } = fakeAdmin({ rpc: () => ({ data: { status: 'ok', token_id: 't1', user_id: UID, time_zone: 'UTC' }, error: null }) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await supabaseWidgetDeps(client as any).auth({ tokenHash: 'h', ipKey: 'k', scope: 'today' })
    expect(client.rpc).toHaveBeenCalledWith('widget_auth', { p_token_hash: 'h', p_ip_key: 'k', p_scope: 'today' })
    expect(r).toEqual({ status: 'ok', userId: UID, tokenId: 't1', timeZone: 'UTC' })
  })
  it.each(['invalid', 'limited'])('auth: %s', async (status) => {
    const { client } = fakeAdmin({ rpc: () => ({ data: { status }, error: null }) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await supabaseWidgetDeps(client as any).auth({ tokenHash: 'h', ipKey: null, scope: 'checkin' })).toEqual({ status })
  })
  it('auth: error de la base o forma inesperada lanza', async () => {
    const bad = fakeAdmin({ rpc: () => ({ data: null, error: { message: 'x' } }) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(supabaseWidgetDeps(bad.client as any).auth({ tokenHash: 'h', ipKey: null, scope: 'today' })).rejects.toThrow()
    const odd = fakeAdmin({ rpc: () => ({ data: { status: 'ok' }, error: null }) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(supabaseWidgetDeps(odd.client as any).auth({ tokenHash: 'h', ipKey: null, scope: 'today' })).rejects.toThrow()
  })
  it('pair: pasa los cinco argumentos y mapea estados', async () => {
    const { client } = fakeAdmin({ rpc: () => ({ data: { status: 'ok', token_id: 't', username: 'pau' }, error: null }) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await supabaseWidgetDeps(client as any).pair({ code: 'C', tokenHash: 'h', label: 'L', previousTokenHash: null, ipKey: 'k' })
    expect(client.rpc).toHaveBeenCalledWith('widget_pair', { p_code: 'C', p_token_hash: 'h', p_label: 'L', p_previous_token_hash: null, p_ip_key: 'k' })
    expect(r).toEqual({ status: 'ok', username: 'pau' })
  })
  it.each(['invalid', 'limited', 'limit_reached'])('pair: %s', async (status) => {
    const { client } = fakeAdmin({ rpc: () => ({ data: { status }, error: null }) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await supabaseWidgetDeps(client as any).pair({ code: 'C', tokenHash: 'h', label: null, previousTokenHash: null, ipKey: null })).toEqual({ status })
  })
  it('checkin: ok con created; error con el mensaje de SQL', async () => {
    const ok = fakeAdmin({ rpc: () => ({ data: [{ checkin_id: 'c', created: false }], error: null }) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await supabaseWidgetDeps(ok.client as any).checkin(UID, 'h')).toEqual({ ok: true, created: false })
    expect(ok.client.rpc).toHaveBeenCalledWith('widget_create_checkin', { p_user_id: UID, p_habit_id: 'h' })
    const bad = fakeAdmin({ rpc: () => ({ data: null, error: { message: 'quantity_habit' } }) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await supabaseWidgetDeps(bad.client as any).checkin(UID, 'h')).toEqual({ ok: false, message: 'quantity_habit' })
  })
})
