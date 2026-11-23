import { describe, expect, it, vi } from 'vitest'
import { groupPageNotFound, inviteRouteDecision, limitedInviteLookup, TOO_MANY_COPY } from '@/domain/group-invite'
import { normalizeInviteCode } from '@/domain/groups'

describe('inviteRouteDecision (/g/[code])', () => {
  it('canonical: render', () => expect(inviteRouteDecision('K7QM4PXD')).toEqual({ kind: 'render', code: 'K7QM4PXD' }))
  it.each(['k7qm4pxd', 'K7QM-4PXD', 'k7qm-4pxd', ' K7QM4PXD', 'k7qm 4pxd'])('variant %j: redirect to the canonical path', (typed) => {
    expect(inviteRouteDecision(typed)).toEqual({ kind: 'redirect', to: '/g/K7QM4PXD' })
  })
  it.each(['', 'abc', 'K7QM4PX0', 'K7QM4PXDD', '../x', 'https://evil.com', '%4B7QM4PXD', 'ﬀ7QM4PXD'])('%j: invalid link, no redirect', (typed) => {
    expect(inviteRouteDecision(typed)).toEqual({ kind: 'invalid' })
  })
  it('never loops and never leaves the origin: the redirect target is a same-origin path whose own decision is "render"', () => {
    for (const typed of ['k7qm4pxd', 'K7QM-4PXD', 'k7qm 4pxd', '//K7QM4PXD', '/K7QM4PXD']) {
      const d = inviteRouteDecision(typed)
      if (d.kind !== 'redirect') continue
      expect(d.to).toMatch(/^\/g\/[2-9A-HJ-NP-Z]{8}$/)
      expect(inviteRouteDecision(d.to.slice(3))).toEqual({ kind: 'render', code: normalizeInviteCode(typed) })
    }
  })
})

describe('groupPageNotFound', () => {
  const ok = { ok: true }
  const failed = { ok: false }
  const gone = { ok: false, notFound: true as const }
  it('any read that says not-found is a 404', () => {
    for (let i = 0; i < 4; i++) {
      const reads = [ok, ok, ok, ok]
      reads[i] = gone
      expect(groupPageNotFound(reads)).toBe(true)
    }
  })
  it('failed reads that are not not-found are not a 404', () => expect(groupPageNotFound([ok, failed, failed, failed])).toBe(false))
  it('all fine is not a 404', () => expect(groupPageNotFound([ok, ok, ok, ok])).toBe(false))
})

describe('limitedInviteLookup', () => {
  const found = { ok: true as const, data: { name: 'x' } }
  const make = (over: Partial<Parameters<typeof limitedInviteLookup<{ name: string }>>[0]> = {}) => ({
    blocked: vi.fn(async () => false),
    lookup: vi.fn(async () => found as { ok: true; data: { name: string } | null } | { ok: false }),
    record: vi.fn(async () => {}),
    ...over,
  })

  it('blocked: no lookup, no record', async () => {
    const d = make({ blocked: vi.fn(async () => true) })
    expect(await limitedInviteLookup(d)).toEqual({ kind: 'blocked' })
    expect(d.lookup).not.toHaveBeenCalled()
    expect(d.record).not.toHaveBeenCalled()
  })
  it('a valid code is found and never recorded', async () => {
    const d = make()
    expect(await limitedInviteLookup(d)).toEqual({ kind: 'found', data: { name: 'x' } })
    expect(d.record).not.toHaveBeenCalled()
  })
  it('an unknown code (null) is recorded once and the link is gone', async () => {
    const d = make({ lookup: vi.fn(async () => ({ ok: true as const, data: null })) })
    expect(await limitedInviteLookup(d)).toEqual({ kind: 'gone' })
    expect(d.record).toHaveBeenCalledTimes(1)
  })
  it('a failed lookup is a failure, not "gone", and records nothing', async () => {
    const d = make({ lookup: vi.fn(async () => ({ ok: false as const })) })
    expect(await limitedInviteLookup(d)).toEqual({ kind: 'failed' })
    expect(d.record).not.toHaveBeenCalled()
  })
  it('a throwing lookup is a failure, never an exception', async () => {
    const d = make({ lookup: vi.fn(async () => { throw new Error('x') }) })
    expect(await limitedInviteLookup(d)).toEqual({ kind: 'failed' })
  })
  it('limiter check fails: a valid code still works, an unknown one is the generic failure (fail closed), nothing recorded', async () => {
    const boom = vi.fn(async () => { throw new Error('limiter down') })
    const valid = make({ blocked: boom })
    expect(await limitedInviteLookup(valid)).toEqual({ kind: 'found', data: { name: 'x' } })
    const unknown = make({ blocked: boom, lookup: vi.fn(async () => ({ ok: true as const, data: null })) })
    expect(await limitedInviteLookup(unknown)).toEqual({ kind: 'failed' })
    expect(unknown.record).not.toHaveBeenCalled()
  })
  it('a failing record never turns the answer into an error', async () => {
    const d = make({ lookup: vi.fn(async () => ({ ok: true as const, data: null })), record: vi.fn(async () => { throw new Error('x') }) })
    expect(await limitedInviteLookup(d)).toEqual({ kind: 'gone' })
  })
  it('the copy', () => expect(TOO_MANY_COPY).toBe('Demasiados intentos. Prueba de nuevo en unos minutos.'))
})
