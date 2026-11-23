import { describe, expect, it, vi } from 'vitest'
import type { GroupDraft } from '@/lib/groups-contract'
import { parseInviteInput } from '@/components/groups/list/parse-invite'
import { openJoinLink } from '@/components/groups/list/open-link'
import { runCreate } from '@/components/groups/create/logic'
import { runJoin } from '@/components/groups/join/logic'

const code = 'K7QM4PXD'
const join = (c: string) => `/g/${c}`

describe('parseInviteInput: safety', () => {
  it.each([
    ['another host', `https://evil.example/otro/${code}`],
    ['a path with ..', `https://k.app/g/../../${code}`],
    ['..', '..'.repeat(10)],
    ['percent-encoded', `https://k.app/g/%2e%2e%2f${code}`],
    ['percent in a bare code', `${code}%2f`],
    ['javascript: URL', 'javascript:alert(1)//aaaaaaaaaaaaaaaa'],
    ['too short', 'K7QM4PX'],
    ['too long', 'K7QM4PXDD'],
    ['a character outside the alphabet', 'K7QM4PX0'],
    ['the old path', `https://k.app/grupos/unirse/${code}`],
    ['two codes', `${code} ${code}`],
  ])('rejects %s', (_n, input) => {
    expect(parseInviteInput(input)).toBeNull()
  })
})

describe('parseInviteInput: any case, hyphen, spaces', () => {
  it.each(['k7qm4pxd', 'K7QM-4PXD', 'k7qm-4pxd', ' k7qm 4pxd ', 'https://k.app/g/k7qm-4pxd', 'http://localhost:3000/g/K7QM4PXD/'])('%j gives the canonical code', (input) => {
    expect(parseInviteInput(input)).toBe(code)
  })
  it('opening it only ever produces /g/<canonical>', () => {
    const navigate = vi.fn()
    openJoinLink({ guard: { current: false }, value: 'k7qm-4pxd', joinHref: join, navigate })
    expect(navigate).toHaveBeenCalledWith('/g/K7QM4PXD')
  })
})

describe('parseInviteInput: trailing punctuation', () => {
  it.each(['.', ',', ';', ':', '!', '?', ')', ']', '"', ' ', '\n', '.)', ' .'])('accepts a code followed by %j', (tail) => {
    expect(parseInviteInput(`${code}${tail}`)).toBe(code)
    expect(parseInviteInput(`https://k.app/g/${code}${tail}`)).toBe(code)
  })
  it('does not strip anything else', () => {
    expect(parseInviteInput(`${code}#`)).toBeNull()
    expect(parseInviteInput(`${code}*`)).toBeNull()
  })
})

const draft = (over: Partial<GroupDraft> = {}): GroupDraft => ({
  name: 'Gym crew',
  icon: 'gym',
  color: 'cielo',
  description: '',
  commitment: { name: 'Ir al gym', icon: 'gym', targetPerWeek: 3, requiresPhoto: false },
  habit: { kind: 'create' },
  ...over,
})

describe('runCreate', () => {
  it('success calls onCreated once with the id and stays locked', async () => {
    const guard = { current: false }
    const onCreated = vi.fn()
    const create = vi.fn().mockResolvedValue({ ok: true, data: { id: 'g9' } })
    const r = await runCreate({ guard, draft: draft(), create, onCreated })
    expect(r).toEqual({ ok: true, id: 'g9' })
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(onCreated).toHaveBeenCalledWith('g9')
    expect(guard.current).toBe(true)
  })
  it('a second call while pending does nothing', async () => {
    const guard = { current: false }
    let release: (v: unknown) => void = () => {}
    const create = vi.fn().mockReturnValue(new Promise((res) => (release = res)))
    const onCreated = vi.fn()
    const first = runCreate({ guard, draft: draft(), create, onCreated })
    const second = await runCreate({ guard, draft: draft(), create, onCreated })
    expect(second).toBeNull()
    expect(create).toHaveBeenCalledTimes(1)
    release({ ok: true, data: { id: 'g1' } })
    await first
    expect(onCreated).toHaveBeenCalledTimes(1)
  })
  it('a server error is returned for display and the guard is released', async () => {
    const guard = { current: false }
    const onCreated = vi.fn()
    const create = vi.fn().mockResolvedValue({ ok: false, error: 'Revisa los datos del grupo.' })
    expect(await runCreate({ guard, draft: draft(), create, onCreated })).toEqual({ ok: false, error: 'Revisa los datos del grupo.' })
    expect(onCreated).not.toHaveBeenCalled()
    expect(guard.current).toBe(false)
  })
  it('a thrown action is a message and releases the guard', async () => {
    const guard = { current: false }
    const r = await runCreate({ guard, draft: draft(), create: async () => { throw new Error('x') }, onCreated: vi.fn() })
    expect(r?.ok).toBe(false)
    expect(guard.current).toBe(false)
  })
  it('invalid input never calls the action and leaves the guard free', async () => {
    const guard = { current: false }
    const create = vi.fn()
    const onCreated = vi.fn()
    const r = await runCreate({ guard, draft: draft({ name: 'a' }), create, onCreated })
    expect(r).toEqual({ ok: false, errors: { name: 'El nombre debe tener entre 3 y 40 letras.' } })
    expect(create).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
    expect(guard.current).toBe(false)
  })
})

describe('runJoin', () => {
  it('success calls onJoined once with the id', async () => {
    const guard = { current: false }
    const onJoined = vi.fn()
    const join = vi.fn().mockResolvedValue({ ok: true, data: { id: 'g1' } })
    expect(await runJoin({ guard, code: 'c', habit: { kind: 'create' }, join, onJoined })).toEqual({ ok: true, id: 'g1' })
    expect(onJoined).toHaveBeenCalledTimes(1)
    expect(onJoined).toHaveBeenCalledWith('g1')
    expect(guard.current).toBe(true)
  })
  it('a second call while pending does nothing', async () => {
    const guard = { current: false }
    let release: (v: unknown) => void = () => {}
    const join = vi.fn().mockReturnValue(new Promise((res) => (release = res)))
    const onJoined = vi.fn()
    const first = runJoin({ guard, code: 'c', habit: { kind: 'create' }, join, onJoined })
    expect(await runJoin({ guard, code: 'c', habit: { kind: 'create' }, join, onJoined })).toBeNull()
    release({ ok: true, data: { id: 'g1' } })
    await first
    expect(join).toHaveBeenCalledTimes(1)
    expect(onJoined).toHaveBeenCalledTimes(1)
  })
  it('server error is returned and the guard released', async () => {
    const guard = { current: false }
    const onJoined = vi.fn()
    const r = await runJoin({ guard, code: 'c', habit: { kind: 'create' }, join: async () => ({ ok: false, error: 'Este grupo está completo.' }), onJoined })
    expect(r).toEqual({ ok: false, error: 'Este grupo está completo.' })
    expect(onJoined).not.toHaveBeenCalled()
    expect(guard.current).toBe(false)
  })
  it('no habit picked: no call, an error, guard free', async () => {
    const guard = { current: false }
    const join = vi.fn()
    const r = await runJoin({ guard, code: 'c', habit: { kind: 'habit', habitId: '' }, join, onJoined: vi.fn() })
    expect(r?.ok).toBe(false)
    expect(join).not.toHaveBeenCalled()
    expect(guard.current).toBe(false)
  })
})

describe('openJoinLink', () => {
  it('navigates only for a valid code, once', () => {
    const guard = { current: false }
    const navigate = vi.fn()
    expect(openJoinLink({ guard, value: `https://k.app/g/${code}`, joinHref: join, navigate })).toEqual({ ok: true, href: join(code) })
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith(join(code))
    expect(openJoinLink({ guard, value: code, joinHref: join, navigate })).toBeNull()
    expect(navigate).toHaveBeenCalledTimes(1)
  })
  it('an invalid value returns the error and never navigates', () => {
    const guard = { current: false }
    const navigate = vi.fn()
    const r = openJoinLink({ guard, value: 'hola', joinHref: join, navigate })
    expect(r?.ok).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
    expect(guard.current).toBe(false)
  })
})
