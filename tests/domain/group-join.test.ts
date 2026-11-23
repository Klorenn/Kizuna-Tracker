import { describe, expect, it, vi } from 'vitest'
import { canCreateGroup } from '@/domain/group-habits'
import { ALREADY_MEMBER_COPY, groupInviteLoginHref, watchAlreadyMember } from '@/domain/group-join'
import type { GroupSummary } from '@/lib/groups-contract'
import { groupErrorCopy } from '@/lib/groups-copy'
import { safeNextPath } from '@/lib/supabase/public-paths'

const CODE = '0123456789abcdef0123456789abcdef'

describe('groupInviteLoginHref', () => {
  it('sends the visitor to login and back to the invitation', () => {
    expect(groupInviteLoginHref(CODE)).toBe(`/login?next=${encodeURIComponent(`/grupos/unirse/${CODE}`)}`)
  })
  it('what comes back through the login form is accepted by safeNextPath', () => {
    const next = new URL(groupInviteLoginHref(CODE), 'https://x.test').searchParams.get('next')
    expect(safeNextPath(next)).toBe(`/grupos/unirse/${CODE}`)
  })
})

describe('ALREADY_MEMBER_COPY', () => {
  it('is the copy the actions return for already_member', () => {
    expect(ALREADY_MEMBER_COPY).toBe(groupErrorCopy('already_member'))
  })
})

describe('watchAlreadyMember', () => {
  it('passes the arguments and the result through', async () => {
    const join = vi.fn(async () => ({ ok: true as const, data: { id: 'g1' } }))
    const seen = vi.fn()
    const wrapped = watchAlreadyMember(join, seen)
    expect(await wrapped(CODE, { kind: 'create' })).toEqual({ ok: true, data: { id: 'g1' } })
    expect(join).toHaveBeenCalledWith(CODE, { kind: 'create' })
    expect(seen).not.toHaveBeenCalled()
  })
  it('tells the page when the person is already in the group, and still returns the error', async () => {
    const result = { ok: false as const, error: ALREADY_MEMBER_COPY }
    const seen = vi.fn()
    const wrapped = watchAlreadyMember(async () => result, seen)
    expect(await wrapped(CODE, { kind: 'create' })).toBe(result)
    expect(seen).toHaveBeenCalledTimes(1)
  })
  it('any other error is not "already a member"', async () => {
    const seen = vi.fn()
    await watchAlreadyMember(async () => ({ ok: false as const, error: 'Este grupo está completo.' }), seen)(CODE, { kind: 'create' })
    expect(seen).not.toHaveBeenCalled()
  })
})

describe('canCreateGroup', () => {
  const g = (archived: boolean, i: number) => ({ id: `g${i}`, archived }) as GroupSummary
  it('fewer than 10 live groups can create', () => {
    expect(canCreateGroup(Array.from({ length: 9 }, (_, i) => g(false, i)))).toBe(true)
    expect(canCreateGroup([])).toBe(true)
  })
  it('10 live groups cannot', () => {
    expect(canCreateGroup(Array.from({ length: 10 }, (_, i) => g(false, i)))).toBe(false)
  })
  it('archived groups do not count', () => {
    expect(canCreateGroup([...Array.from({ length: 9 }, (_, i) => g(false, i)), g(true, 20), g(true, 21)])).toBe(true)
  })
})
