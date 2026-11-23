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
/** `lookup` answers group_invite_lookup (the only call on the limited path); `preview` answers the unlimited local-dev path. */
function fake(answers: { lookup?: Answer; preview?: Answer }) {
  const calls: [string, Record<string, unknown>][] = []
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push([name, args])
    if (name === 'group_invite_lookup') return { error: null, ...(answers.lookup ?? { data: { limited: false, preview: PREVIEW } }) }
    return { error: null, ...(answers.preview ?? { data: PREVIEW }) }
  })
  return { client: { rpc }, calls, names: () => calls.map((c) => c[0]) }
}

const looked = (preview: unknown, limited = false): Answer => ({ data: { limited, preview } })

beforeEach(() => createAdminClient.mockReset())

describe('keys and limits', () => {
  it('the page keys on the client address (IPv6 by its /64), the join on the person', () => {
    expect(pageInviteKey('1.2.3.4')).toBe('ginv:addr:1.2.3.4')
    expect(pageInviteKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('ginv:addr:v6:2001:db8:1:2')
    expect(pageInviteKey('2001:db8:1:2::9')).toBe(pageInviteKey('2001:db8:1:2:1::'))
    expect(pageInviteKey('::ffff:1.2.3.4')).toBe('ginv:addr:1.2.3.4')
    expect(pageInviteKey(null)).toBe('ginv:addr:unknown')
    expect(pageInviteKey('garbage')).toBe('ginv:addr:unknown')
    expect(joinInviteKey(U)).toBe(`gjoin:user:${U}`)
    expect(PAGE_LIMIT).toEqual({ limit: 20, windowSeconds: 900 })
    expect(JOIN_LIMIT).toEqual({ limit: 10, windowSeconds: 3600 })
  })
})

describe('lookupInvite', () => {
  const run = (f: ReturnType<typeof fake>, over: Partial<Parameters<typeof lookupInvite>[0]> = {}) =>
    lookupInvite({ code: CODE, viewerId: null, key: 'ginv:addr:1.2.3.4', ...PAGE_LIMIT, client: f.client, ...over })

  it('the whole limited path is ONE database call, with the key, the limit and the window; no rate_limit call', async () => {
    const f = fake({})
    await run(f)
    expect(f.calls).toEqual([
      ['group_invite_lookup', { p_code: CODE, p_viewer: null, p_key: 'ginv:addr:1.2.3.4', p_limit: 20, p_window_seconds: 900 }],
    ])
  })

  it('limited: blocked', async () => {
    expect(await run(fake({ lookup: looked(null, true) }))).toEqual({ kind: 'blocked' })
  })

  it('a valid code is found', async () => {
    const r = await run(fake({}))
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

  it('an unknown code (preview null, not limited): the link is gone, in the same single call', async () => {
    const f = fake({ lookup: looked(null) })
    expect(await run(f)).toEqual({ kind: 'gone' })
    expect(f.names()).toEqual(['group_invite_lookup'])
  })

  it('the viewer goes to the database as given, null when signed out', async () => {
    const out = fake({})
    await run(out)
    expect(out.calls[0][1].p_viewer).toBeNull()
    const signed = fake({})
    await run(signed, { viewerId: U })
    expect(signed.calls[0][1].p_viewer).toBe(U)
  })

  it('the join path uses its own key, limit and window through the same function', async () => {
    const f = fake({})
    await run(f, { viewerId: U, key: joinInviteKey(U), ...JOIN_LIMIT })
    expect(f.calls[0][1]).toMatchObject({ p_key: `gjoin:user:${U}`, p_limit: 10, p_window_seconds: 3600 })
  })

  it('an active member: the group id comes back', async () => {
    const f = fake({ lookup: looked({ ...PREVIEW, member: true, group_id: G }) })
    expect(await run(f, { viewerId: U })).toMatchObject({ kind: 'found', data: { memberGroupId: G } })
  })

  it('member without a valid group id is a malformed answer', async () => {
    const f = fake({ lookup: looked({ ...PREVIEW, member: true, group_id: 'x' }) })
    expect(await run(f, { viewerId: U })).toEqual({ kind: 'failed' })
  })

  it('no address to skip on (null key, local development only): the unlimited preview call, nothing else', async () => {
    const f = fake({})
    expect((await run(f, { key: null })).kind).toBe('found')
    expect(f.names()).toEqual(['group_invite_preview_for'])
    const g = fake({ preview: { data: null } })
    expect(await run(g, { key: null })).toEqual({ kind: 'gone' })
    expect(g.names()).toEqual(['group_invite_preview_for'])
  })

  it.each([
    ['an error from the call', { data: null, error: { message: 'down' } }],
    ['a null answer', { data: null }],
    ['a non-object answer', { data: 'yes' }],
    ['an array answer', { data: [] }],
    ['a missing "limited"', { data: { preview: PREVIEW } }],
    ['a non-boolean "limited"', { data: { limited: 'no', preview: PREVIEW } }],
    ['a malformed preview', { data: { limited: false, preview: { ...PREVIEW, full: 'no' } } }],
    ['a preview that is not an object', { data: { limited: false, preview: 'x' } }],
    ['a missing "preview"', { data: { limited: false } }],
  ] as const)('limiter or lookup failing (%s): the error state for ANY code, never a preview, never "gone"', async (_n, answer) => {
    const valid = fake({ lookup: answer as Answer })
    expect(await run(valid)).toEqual({ kind: 'failed' })
    expect(valid.names()).toEqual(['group_invite_lookup'])
  })

  it('a throwing call is a failure, not an exception', async () => {
    const client = { rpc: vi.fn(async () => { throw new Error('network') }) }
    expect(await lookupInvite({ code: CODE, viewerId: null, key: 'k', ...PAGE_LIMIT, client })).toEqual({ kind: 'failed' })
  })

  it('without an injected client it builds the service-role one; a missing configuration is a failure, not an exception', async () => {
    createAdminClient.mockImplementation(() => {
      throw new Error('Supabase service configuration is missing')
    })
    expect(await lookupInvite({ code: CODE, viewerId: null, key: 'ginv:addr:x', ...PAGE_LIMIT })).toEqual({ kind: 'failed' })
    const f = fake({})
    createAdminClient.mockReturnValue(f.client)
    expect((await lookupInvite({ code: CODE, viewerId: null, key: 'ginv:addr:x', ...PAGE_LIMIT })).kind).toBe('found')
  })

  it('never calls the old preview function or a separate limiter call, and the module is server-only', () => {
    const src = readFileSync('src/lib/groups-invite-server.ts', 'utf8')
    expect(src).toMatch(/^import ["']server-only["']/m)
    expect(src).not.toContain("'group_invite_preview'")
    expect(src).not.toMatch(/rateLimit\(|'rate_limit'/)
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
