import { readdirSync, readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const createAdminClient = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClient() }))

import { JOIN_LIMIT, joinInviteKey, lookupInvite, PAGE_LIMIT, pageInviteKey } from '@/lib/groups-invite-server'

const CODE = 'K7QM4PXD'
const U = '11111111-1111-4111-8111-111111111111'
const G = '22222222-2222-4222-8222-222222222222'
const PREVIEW = {
  name: 'Gym',
  icon: 'barbell',
  color: 'indigo',
  commitment_name: 'Ir al gym',
  commitment_icon: 'barbell',
  target_per_week: 3,
  requires_photo: true,
  member_count: 12,
  full: false,
}

type Answer = { data: unknown; error?: { message: string } | null }
function fake(answers: { limit?: Answer | (() => Answer); preview?: Answer }) {
  const calls: [string, Record<string, unknown>][] = []
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push([name, args])
    if (name === 'rate_limit') {
      const a = typeof answers.limit === 'function' ? answers.limit() : (answers.limit ?? { data: false })
      return { error: null, ...a }
    }
    return { error: null, ...(answers.preview ?? { data: PREVIEW }) }
  })
  return { client: { rpc }, calls, names: () => calls.map((c) => c[0]) }
}

beforeEach(() => createAdminClient.mockReset())

describe('keys and limits', () => {
  it('the page keys on the client address, the join on the person', () => {
    expect(pageInviteKey('1.2.3.4')).toBe('ginv:addr:1.2.3.4')
    expect(pageInviteKey(null)).toBeNull()
    expect(joinInviteKey(U)).toBe(`gjoin:user:${U}`)
    expect(PAGE_LIMIT).toEqual({ limit: 20, windowSeconds: 900 })
    expect(JOIN_LIMIT).toEqual({ limit: 10, windowSeconds: 3600 })
  })
})

describe('lookupInvite', () => {
  const run = (f: ReturnType<typeof fake>, over: Partial<Parameters<typeof lookupInvite>[0]> = {}) =>
    lookupInvite({ code: CODE, viewerId: null, key: 'ginv:addr:1.2.3.4', ...PAGE_LIMIT, client: f.client, ...over })

  it('over the limit: only the check-only call, no lookup', async () => {
    const f = fake({ limit: { data: true } })
    expect(await run(f)).toEqual({ kind: 'blocked' })
    expect(f.calls).toEqual([['rate_limit', { p_key: 'ginv:addr:1.2.3.4', p_limit: 20, p_window_seconds: 900, p_record: false }]])
  })

  it('a valid code: check, lookup, and no recording', async () => {
    const f = fake({})
    const r = await run(f)
    expect(f.names()).toEqual(['rate_limit', 'group_invite_preview_for'])
    expect(r).toEqual({
      kind: 'found',
      data: {
        preview: {
          name: 'Gym',
          icon: 'barbell',
          color: 'indigo',
          commitment: { name: 'Ir al gym', icon: 'barbell', targetPerWeek: 3, requiresPhoto: true },
          memberCount: 12,
          full: false,
        },
        memberGroupId: null,
      },
    })
  })

  it('an unknown code: check, lookup, then one recording call; the link is gone', async () => {
    const f = fake({ preview: { data: null } })
    expect(await run(f)).toEqual({ kind: 'gone' })
    expect(f.calls.map((c) => [c[0], c[1].p_record])).toEqual([['rate_limit', false], ['group_invite_preview_for', undefined], ['rate_limit', true]])
  })

  it('the viewer goes to the database as given, null when signed out', async () => {
    const out = fake({})
    await run(out)
    expect(out.calls[1][1]).toEqual({ p_code: CODE, p_viewer: null })
    const signed = fake({})
    await run(signed, { viewerId: U })
    expect(signed.calls[1][1]).toEqual({ p_code: CODE, p_viewer: U })
  })

  it('an active member: the group id comes back', async () => {
    const f = fake({ preview: { data: { ...PREVIEW, member: true, group_id: G } } })
    const r = await run(f, { viewerId: U })
    expect(r).toMatchObject({ kind: 'found', data: { memberGroupId: G } })
  })

  it('member without a valid group id is a malformed answer', async () => {
    const f = fake({ preview: { data: { ...PREVIEW, member: true, group_id: 'x' } } })
    expect(await run(f, { viewerId: U })).toEqual({ kind: 'failed' })
  })

  it('no address (null key): no limiter calls at all, the lookup still works', async () => {
    const f = fake({})
    const r = await run(f, { key: null })
    expect(f.names()).toEqual(['group_invite_preview_for'])
    expect(r.kind).toBe('found')
    const g = fake({ preview: { data: null } })
    expect(await run(g, { key: null })).toEqual({ kind: 'gone' })
    expect(g.names()).toEqual(['group_invite_preview_for'])
  })

  it('the limiter failing: a valid code still works; an unknown one is the generic failure and records nothing', async () => {
    const valid = fake({ limit: { data: null, error: { message: 'down' } } })
    expect((await run(valid)).kind).toBe('found')
    const unknown = fake({ limit: { data: null, error: { message: 'down' } }, preview: { data: null } })
    expect(await run(unknown)).toEqual({ kind: 'failed' })
    expect(unknown.calls.filter((c) => c[1].p_record === true)).toHaveLength(0)
  })

  it('a failed or malformed lookup is a failure, never "gone", and records nothing', async () => {
    const bad = fake({ preview: { data: null, error: { message: 'timeout' } } })
    expect(await run(bad)).toEqual({ kind: 'failed' })
    const odd = fake({ preview: { data: { ...PREVIEW, full: 'no' } } })
    expect(await run(odd)).toEqual({ kind: 'failed' })
    expect(bad.calls.concat(odd.calls).filter((c) => c[1].p_record === true)).toHaveLength(0)
  })

  it('without an injected client it builds the service-role one; a missing configuration is a failure, not an exception', async () => {
    createAdminClient.mockImplementation(() => {
      throw new Error('Supabase service configuration is missing')
    })
    expect(await lookupInvite({ code: CODE, viewerId: null, key: null, ...PAGE_LIMIT })).toEqual({ kind: 'failed' })
    const f = fake({})
    createAdminClient.mockReturnValue(f.client)
    expect((await lookupInvite({ code: CODE, viewerId: null, key: null, ...PAGE_LIMIT })).kind).toBe('found')
  })

  it('never calls the old preview function, and the module is server-only', () => {
    const src = readFileSync('src/lib/groups-invite-server.ts', 'utf8')
    expect(src).toMatch(/^import ["']server-only["']/m)
    expect(src).not.toContain("'group_invite_preview'")
    const rpcSrc = readFileSync('src/lib/groups-rpc.ts', 'utf8')
    expect(rpcSrc).not.toMatch(/'group_invite_preview'/)
  })
})

describe('no client component can reach the service role through this module', () => {
  it('every importer is a server file (no "use client")', () => {
    const files = (readdirSync('src', { recursive: true }) as string[]).filter((f) => /\.(ts|tsx)$/.test(f))
    const importers = files.filter((f) => /groups-invite-server/.test(readFileSync(`src/${f}`, 'utf8')) && !f.endsWith('groups-invite-server.ts'))
    expect(importers.length).toBeGreaterThan(0)
    for (const f of importers) expect(readFileSync(`src/${f}`, 'utf8')).not.toMatch(/^\s*["']use client["']/m)
  })
})
