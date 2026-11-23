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

describe('limitedInviteLookup (one database call decides limited / found / gone)', () => {
  type T = { name: string }
  type R = { ok: true; limited: boolean; data: T | null } | { ok: false }
  const run = (lookup: () => Promise<R>) => limitedInviteLookup<T>({ lookup })

  it('limited: blocked, whatever else came back', async () => {
    expect(await run(async () => ({ ok: true, limited: true, data: null }))).toEqual({ kind: 'blocked' })
    expect(await run(async () => ({ ok: true, limited: true, data: { name: 'x' } }))).toEqual({ kind: 'blocked' })
  })
  it('a valid code is found', async () => {
    expect(await run(async () => ({ ok: true, limited: false, data: { name: 'x' } }))).toEqual({ kind: 'found', data: { name: 'x' } })
  })
  it('an unknown code (null, not limited) is gone', async () => {
    expect(await run(async () => ({ ok: true, limited: false, data: null }))).toEqual({ kind: 'gone' })
  })
  it('the call is made exactly once', async () => {
    const lookup = vi.fn(async (): Promise<R> => ({ ok: true, limited: false, data: null }))
    await run(lookup)
    expect(lookup).toHaveBeenCalledTimes(1)
  })
  it('a failed lookup is the generic failure for any code: never "gone", never a preview', async () => {
    expect(await run(async () => ({ ok: false }))).toEqual({ kind: 'failed' })
  })
  it('a throwing lookup is a failure, never an exception', async () => {
    expect(await run(async () => { throw new Error('x') })).toEqual({ kind: 'failed' })
  })
  it('the copy', () => expect(TOO_MANY_COPY).toBe('Demasiados intentos. Prueba de nuevo en unos minutos.'))
})
