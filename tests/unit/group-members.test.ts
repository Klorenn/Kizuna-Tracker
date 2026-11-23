import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MembersList, MemberRow, doInvite, doLeave, doRemove, doSetAdmin, inviteDecision, openInvite } from '@/components/groups/detail/MembersList'
import { createRunner } from '@/components/groups/detail/group-logic'
import type { GroupBoardRow } from '@/lib/groups-contract'

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const member = (n: string, role: 'admin' | 'member' = 'member'): GroupBoardRow => ({
  userId: `u-${n}`,
  username: n,
  displayName: n.toUpperCase(),
  avatarPath: null,
  avatarPreset: null,
  role,
  joinedOn: '2026-11-02',
  counts: true,
  done: 1,
  target: 3,
})
const detail = {
  id: 'g1',
  name: 'Gym del sur',
  icon: 'barbell',
  color: 'salvia',
  commitment: { name: 'Gimnasio', icon: 'barbell', targetPerWeek: 3, requiresPhoto: false },
  role: 'admin' as 'admin' | 'member',
  archived: false,
}
const noop = () => {}
const actions = {
  update: vi.fn(),
  setCommitment: vi.fn(),
  archive: vi.fn(),
  createInvite: vi.fn(),
  leave: vi.fn(),
  removeMember: vi.fn(),
  setAdmin: vi.fn(),
}
const render = (over: { detail?: Partial<typeof detail>; members?: GroupBoardRow[] | null; me?: string } = {}) =>
  renderToStaticMarkup(
    createElement(MembersList, {
      detail: { ...detail, ...over.detail },
      members: over.members === undefined ? [member('ana', 'admin'), member('beto'), member('cami')] : over.members,
      myUserId: over.me ?? 'u-ana',
      actions,
      retryHref: '/grupos/g1',
      onLeft: noop,
      onEdited: noop,
      onCommitmentSet: noop,
      onArchived: noop,
      onMemberRemoved: noop,
      onRoleChanged: noop,
    }),
  )

describe('MembersList: rows', () => {
  it('lists every member with their role; the caller is marked "Tú"', () => {
    const h = render()
    expect(h.match(/<li/g)).toHaveLength(3)
    expect(text(h)).toContain('Administrador')
    expect(text(h)).toContain('Miembro')
    expect(h.match(/>Tú</g)).toHaveLength(1)
    expect(h).toContain('href="/@beto"')
  })

  it('a failed members read is a retry line, but the actions of the person stay available', () => {
    const h = render({ members: null })
    expect(text(h)).toContain('No pudimos cargar esto')
    expect(text(h)).toContain('Salir del grupo')
  })

  it('only name, @usuario, avatar and role: nothing else a row may carry', () => {
    const leaky = { ...member('beto'), email: 'b@secret.test', note: 'peso 70', joinedOn: '2020-01-01' } as GroupBoardRow
    const h = render({ members: [member('ana', 'admin'), leaky] })
    for (const s of ['secret.test', 'peso 70', '2020-01-01']) expect(h).not.toContain(s)
  })

  it('50 members with long names: one line each, truncated, no arbitrary sizes of ours', () => {
    const rows = [member('ana', 'admin'), ...Array.from({ length: 49 }, (_, i) => ({ ...member(`u${i}`), displayName: 'Nombre larguísimo '.repeat(5) }))]
    const h = render({ members: rows })
    expect(h.match(/<li/g)).toHaveLength(50)
    expect(h).toContain('truncate')
    expect(h).toContain('min-w-0')
  })

  it('every row is memoized', () => {
    expect((MemberRow as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'))
  })
})

describe('MembersList: who can do what', () => {
  it('an administrator: Invitar, a menu per OTHER member, edit, commitment, archive and leave', () => {
    const h = render()
    const t = text(h)
    expect(t).toContain('Invitar')
    expect(h).toContain('aria-label="Opciones de BETO"')
    expect(h).toContain('aria-label="Opciones de CAMI"')
    expect(h).not.toContain('aria-label="Opciones de ANA"')
    for (const s of ['Editar grupo', 'Cambiar compromiso', 'Archivar grupo', 'Salir del grupo']) expect(t).toContain(s)
  })

  it('a plain member: only the list and "Salir del grupo"', () => {
    const h = render({ detail: { role: 'member' }, me: 'u-beto' })
    const t = text(h)
    expect(t).toContain('Salir del grupo')
    for (const s of ['Invitar', 'Editar grupo', 'Cambiar compromiso', 'Archivar grupo']) expect(t).not.toContain(s)
    expect(h).not.toContain('Opciones de')
  })

  it('an archived group is read-only: no actions at all, not even for an administrator', () => {
    const h = render({ detail: { archived: true } })
    const t = text(h)
    for (const s of ['Invitar', 'Editar grupo', 'Cambiar compromiso', 'Archivar grupo', 'Salir del grupo']) expect(t).not.toContain(s)
    expect(h).not.toContain('Opciones de')
    expect(h.match(/<li/g)).toHaveLength(3)
    expect(h).not.toContain('<button')
  })

  it('touch targets: the menu button is 44 px', () => {
    expect(render()).toMatch(/aria-label="Opciones de BETO"[^>]*class="[^"]*size-11/)
  })
})

describe('action handlers', () => {
  it('doLeave: ok calls onLeft once', async () => {
    const leave = vi.fn().mockResolvedValue({ ok: true, data: undefined })
    const onLeft = vi.fn()
    expect(await doLeave(createRunner(), leave, 'g1', onLeft)).toEqual({ ok: true, data: undefined })
    expect(leave).toHaveBeenCalledWith('g1')
    expect(onLeft).toHaveBeenCalledTimes(1)
  })

  it('doLeave: last_admin comes back as the error to show, and the person stays', async () => {
    const leave = vi.fn().mockResolvedValue({ ok: false, error: 'Eres el único administrador. Nombra a otro antes de salir.' })
    const onLeft = vi.fn()
    expect(await doLeave(createRunner(), leave, 'g1', onLeft)).toEqual({
      ok: false,
      error: 'Eres el único administrador. Nombra a otro antes de salir.',
    })
    expect(onLeft).not.toHaveBeenCalled()
  })

  it('a second tap while one is in flight does nothing (no double submit)', async () => {
    let release: (v: { ok: true; data: undefined }) => void = () => {}
    const leave = vi.fn(() => new Promise<{ ok: true; data: undefined }>((r) => (release = r)))
    const runner = createRunner()
    const onLeft = vi.fn()
    const first = doLeave(runner, leave, 'g1', onLeft)
    expect(await doLeave(runner, leave, 'g1', onLeft)).toBeNull()
    release({ ok: true, data: undefined })
    await first
    expect(leave).toHaveBeenCalledTimes(1)
    expect(onLeft).toHaveBeenCalledTimes(1)
  })

  it('doRemove: ok reports the member removed; failure does not', async () => {
    const onRemoved = vi.fn()
    await doRemove(createRunner(), vi.fn().mockResolvedValue({ ok: true, data: undefined }), 'g1', 'u-beto', onRemoved)
    expect(onRemoved).toHaveBeenCalledWith('u-beto')
    const bad = vi.fn()
    const r = await doRemove(createRunner(), vi.fn().mockResolvedValue({ ok: false, error: 'Solo un administrador puede hacer eso.' }), 'g1', 'u-beto', bad)
    expect(r).toEqual({ ok: false, error: 'Solo un administrador puede hacer eso.' })
    expect(bad).not.toHaveBeenCalled()
  })

  it('doSetAdmin: passes the new value; admin_limit is returned as the error', async () => {
    const set = vi.fn().mockResolvedValue({ ok: false, error: 'Un grupo puede tener hasta 3 administradores.' })
    const onChanged = vi.fn()
    expect(await doSetAdmin(createRunner(), set, 'g1', 'u-beto', true, onChanged)).toEqual({
      ok: false,
      error: 'Un grupo puede tener hasta 3 administradores.',
    })
    expect(set).toHaveBeenCalledWith('g1', 'u-beto', true)
    expect(onChanged).not.toHaveBeenCalled()
    const ok = vi.fn().mockResolvedValue({ ok: true, data: undefined })
    await doSetAdmin(createRunner(), ok, 'g1', 'u-beto', false, onChanged)
    expect(onChanged).toHaveBeenCalledWith('u-beto', 'member')
  })

  it('doInvite: a link or the error (invite_limit)', async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, data: { code: 'K7QM4PXD', url: 'https://k.test/g/K7QM4PXD' } })
    expect(await doInvite(createRunner(), ok, 'g1')).toEqual({ status: 'ready', url: 'https://k.test/g/K7QM4PXD', code: 'K7QM4PXD' })
    const bad = vi.fn().mockResolvedValue({ ok: false, error: 'Ya hay 5 enlaces activos. Espera a que venza alguno.' })
    expect(await doInvite(createRunner(), bad, 'g1')).toEqual({
      status: 'error',
      error: 'Ya hay 5 enlaces activos. Espera a que venza alguno.',
    })
  })

  it('a thrown action is an error result, not an unhandled rejection', async () => {
    const r = await doLeave(createRunner(), vi.fn().mockRejectedValue(new Error('offline')), 'g1', vi.fn())
    expect(r).toMatchObject({ ok: false })
  })
})

describe('invite link reuse (fix round 1, I2)', () => {
  it('decides: create on first open and after an error; reuse a ready or running one', () => {
    expect(inviteDecision(null)).toBe('create')
    expect(inviteDecision({ status: 'error', error: 'x' })).toBe('create')
    expect(inviteDecision({ status: 'ready', url: 'u', code: 'K7QM4PXD' })).toBe('reuse')
    expect(inviteDecision({ status: 'pending' })).toBe('reuse')
  })

  it('first open: one call; reopen: no call and the same URL; error then retry: a second call', async () => {
    const create = vi.fn().mockResolvedValueOnce({ ok: true, data: { code: 'K7QM4PXD', url: 'https://k.test/g/K7QM4PXD' } })
    const runner = createRunner()
    const first = await openInvite(runner, create, 'g1', null)
    expect(first).toEqual({ status: 'ready', url: 'https://k.test/g/K7QM4PXD', code: 'K7QM4PXD' })
    expect(await openInvite(runner, create, 'g1', first)).toEqual(first)
    expect(create).toHaveBeenCalledTimes(1)

    const failing = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'Ya hay 5 enlaces activos. Espera a que venza alguno.' })
      .mockResolvedValueOnce({ ok: true, data: { code: 'B3B3B3B3', url: 'https://k.test/g/B3B3B3B3' } })
    const err = await openInvite(runner, failing, 'g1', null)
    expect(err).toMatchObject({ status: 'error' })
    expect(await openInvite(runner, failing, 'g1', err)).toEqual({ status: 'ready', url: 'https://k.test/g/B3B3B3B3', code: 'B3B3B3B3' })
    expect(failing).toHaveBeenCalledTimes(2)
  })

  it('a double tap calls the action once', async () => {
    let release: (v: unknown) => void = () => {}
    const create = vi.fn(() => new Promise((r) => (release = r)))
    const runner = createRunner()
    const a = openInvite(runner, create as never, 'g1', null)
    const b = await openInvite(runner, create as never, 'g1', null)
    expect(b).toBeNull()
    release({ ok: true, data: { code: 'A', url: 'u' } })
    await a
    expect(create).toHaveBeenCalledTimes(1)
  })
})
