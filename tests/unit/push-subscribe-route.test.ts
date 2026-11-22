import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = { user: 'u1' as string | null, calls: [] as string[] }

function chain(table: string) {
  const c: Record<string, unknown> = {}
  const rec = (op: string) => (...a: unknown[]) => {
    state.calls.push(`${table}.${op}(${a.map((x) => JSON.stringify(x)).join(',')})`)
    return c
  }
  for (const op of ['delete', 'upsert', 'insert', 'eq', 'neq']) c[op] = rec(op)
  c.then = (res: (v: unknown) => void) => res({ error: null })
  return c
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: chain }) }))

import { DELETE, POST } from '@/app/api/push/subscribe/route'

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc'
const sub = { endpoint: ENDPOINT, keys: { p256dh: 'B' + 'A'.repeat(86), auth: 'A'.repeat(22) } }
const req = (method: string, body: unknown) =>
  new Request('https://kizuna.app/api/push/subscribe', { method, body: JSON.stringify(body) })

beforeEach(() => {
  state.user = 'u1'
  state.calls = []
})

describe('POST /api/push/subscribe', () => {
  it('401 without a session', async () => {
    state.user = null
    expect((await POST(req('POST', sub))).status).toBe(401)
  })
  it('400 for a disallowed endpoint and writes nothing', async () => {
    const r = await POST(req('POST', { ...sub, endpoint: 'https://169.254.169.254/x' }))
    expect(r.status).toBe(400)
    expect(state.calls).toEqual([])
  })
  it("clears another user's row for the endpoint before storing it for the caller", async () => {
    expect((await POST(req('POST', sub))).status).toBe(200)
    const delIdx = state.calls.findIndex((c) => c.startsWith('push_subscriptions.neq("user_id","u1")'))
    const upIdx = state.calls.findIndex((c) => c.startsWith('push_subscriptions.upsert'))
    expect(delIdx).toBeGreaterThanOrEqual(0)
    expect(upIdx).toBeGreaterThan(delIdx)
  })
})

describe('DELETE /api/push/subscribe', () => {
  it('401 without a session', async () => {
    state.user = null
    expect((await DELETE(req('DELETE', { endpoint: ENDPOINT }))).status).toBe(401)
  })
  it('deletes only the caller\'s row for that endpoint', async () => {
    expect((await DELETE(req('DELETE', { endpoint: ENDPOINT }))).status).toBe(200)
    expect(state.calls.join('|')).toContain('push_subscriptions.eq("user_id","u1")')
    expect(state.calls.join('|')).toContain(`push_subscriptions.eq("endpoint","${ENDPOINT}")`)
  })
  it('400 without an endpoint', async () => {
    expect((await DELETE(req('DELETE', {}))).status).toBe(400)
  })
})
