import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createRunner } from '@/components/groups/detail/group-logic'
import { RejectedList } from '@/components/groups/reject/RejectedList'
import { RejectForm, RejectPhotoButton } from '@/components/groups/reject/RejectPhotoButton'
import { canRejectPhoto, prepareReason } from '@/components/groups/reject/reject-logic'
import { runAndNotify } from '@/components/groups/fund/fund-logic'
import type { GroupFineActions, GroupRejectedItem } from '@/lib/groups-fines-contract'

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const NOW = Date.parse('2026-11-23T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString()

const base = {
  role: 'admin' as const,
  archived: false,
  requiresPhoto: true,
  hasPhoto: true,
  ownerId: 'u-beto',
  myUserId: 'u-ana',
  createdAt: hoursAgo(2),
  now: NOW,
}

describe('canRejectPhoto', () => {
  it('admin, another person, photo, under 24 h, photo commitment: yes', () => {
    expect(canRejectPhoto(base)).toBe(true)
  })
  it('never for members', () => {
    expect(canRejectPhoto({ ...base, role: 'member' })).toBe(false)
  })
  it('never in an archived group', () => {
    expect(canRejectPhoto({ ...base, archived: true })).toBe(false)
  })
  it('never on their own photo', () => {
    expect(canRejectPhoto({ ...base, ownerId: 'u-ana' })).toBe(false)
  })
  it('never when the commitment does not require a photo or the check-in has none', () => {
    expect(canRejectPhoto({ ...base, requiresPhoto: false })).toBe(false)
    expect(canRejectPhoto({ ...base, hasPhoto: false })).toBe(false)
  })
  it('24 hours is the edge: 23 h 59 min yes, exactly 24 h and older no', () => {
    expect(canRejectPhoto({ ...base, createdAt: new Date(NOW - 24 * 3600_000 + 60_000).toISOString() })).toBe(true)
    expect(canRejectPhoto({ ...base, createdAt: hoursAgo(24) })).toBe(false)
    expect(canRejectPhoto({ ...base, createdAt: hoursAgo(30) })).toBe(false)
  })
  it('an unreadable date is a no', () => {
    expect(canRejectPhoto({ ...base, createdAt: 'nope' })).toBe(false)
  })
})

describe('prepareReason', () => {
  it('trims and accepts 1..140 characters', () => {
    expect(prepareReason('  borrosa  ')).toEqual({ ok: true, reason: 'borrosa' })
    expect(prepareReason('x'.repeat(140)).ok).toBe(true)
  })
  it('empty or too long: the binding error', () => {
    const err = { ok: false, error: 'Escribe un motivo de hasta 140 letras.' }
    expect(prepareReason('   ')).toEqual(err)
    expect(prepareReason('x'.repeat(141))).toEqual(err)
  })
})

describe('reject and undo through the runner', () => {
  it('success calls the action once with the group, check-in and trimmed reason', async () => {
    const runner = createRunner()
    const reject = vi.fn<GroupFineActions['rejectPhoto']>().mockResolvedValue({ ok: true, data: undefined })
    const onOk = vi.fn()
    await runAndNotify(runner, () => reject('g1', 'c1', 'borrosa'), onOk)
    expect(reject).toHaveBeenCalledWith('g1', 'c1', 'borrosa')
    expect(onOk).toHaveBeenCalledTimes(1)
  })
  it('a second tap while pending does nothing; an error frees the control', async () => {
    const runner = createRunner()
    let release!: (v: { ok: false; error: string }) => void
    const undo = vi.fn(() => new Promise<{ ok: false; error: string }>((res) => (release = res)))
    const first = runAndNotify(runner, undo)
    expect(await runAndNotify(runner, undo)).toBeNull()
    expect(undo).toHaveBeenCalledTimes(1)
    release({ ok: false, error: 'Esa semana ya cerró.' })
    expect(await first).toEqual({ ok: false, error: 'Esa semana ya cerró.' })
    expect(runner.busy()).toBe(false)
  })
})

describe('RejectPhotoButton', () => {
  const render = (over: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(RejectPhotoButton, {
        groupId: 'g1',
        checkinId: 'c1',
        ownerName: 'BETO',
        actions: { rejectPhoto: vi.fn() },
        ...base,
        ...over,
      }),
    )

  it('shows "Rechazar foto" with a 44 px target when allowed', () => {
    const h = render()
    expect(text(h)).toContain('Rechazar foto')
    expect(h).toContain('h-11')
  })
  it('renders nothing when any rule fails', () => {
    for (const over of [{ role: 'member' }, { archived: true }, { ownerId: 'u-ana' }, { requiresPhoto: false }, { hasPhoto: false }, { createdAt: hoursAgo(25) }])
      expect(render(over)).toBe('')
  })
})

describe('RejectForm', () => {
  const form = (o: { pending?: boolean; error?: string | null } = {}) =>
    renderToStaticMarkup(createElement(RejectForm, { pending: o.pending ?? false, error: o.error ?? null, onSubmit: () => {} }))

  it('has the binding label and submit, and a counter in the mono face', () => {
    const h = form()
    expect(text(h)).toContain('Motivo (lo verá solo esa persona)')
    expect(text(h)).toContain('Rechazar')
    expect(h).toContain('maxLength="140"')
    expect(h).toContain('font-mono')
  })
  it('pending disables the field and the button', () => {
    const h = form({ pending: true })
    expect(text(h)).toContain('Rechazando…')
    expect(h.match(/<(textarea|button)[^>]*disabled/g)).toHaveLength(2)
  })
  it('shows the server error', () => {
    expect(form({ error: 'Solo se puede rechazar una foto dentro de 24 horas.' })).toContain('role="alert"')
  })
})

describe('RejectedList', () => {
  const item = (n: string, over: Partial<GroupRejectedItem> = {}): GroupRejectedItem => ({
    userId: `u-${n}`,
    username: n,
    displayName: n.toUpperCase(),
    avatarPath: null,
    avatarPreset: null,
    checkinId: `c-${n}`,
    localDate: '2026-11-22',
    photoPath: null,
    reason: 'Foto borrosa',
    rejectedByName: 'Ana',
    rejectedAt: '2026-11-22T20:00:00Z',
    ...over,
  })
  const list = (o: { items?: GroupRejectedItem[] | null; role?: 'admin' | 'member'; archived?: boolean } = {}) =>
    renderToStaticMarkup(
      createElement(RejectedList, {
        groupId: 'g1',
        items: o.items === undefined ? [item('beto')] : o.items,
        role: o.role ?? 'admin',
        archived: o.archived ?? false,
        retryHref: '/grupos/g1',
        actions: { undoRejectPhoto: vi.fn() },
      }),
    )

  it('admins see the section with the reason, who rejected and "Deshacer rechazo"', () => {
    const t = text(list())
    expect(t).toContain('Fotos rechazadas')
    expect(t).toContain('BETO')
    expect(t).toContain('Foto borrosa')
    expect(t).toContain('Rechazó Ana')
    expect(t).toContain('Deshacer rechazo')
  })
  it('absent for members: the reason never reaches them', () => {
    const h = list({ role: 'member' })
    expect(h).toBe('')
    expect(h).not.toContain('Foto borrosa')
  })
  it('archived: the list stays readable but there is nothing to press', () => {
    const h = list({ archived: true })
    expect(text(h)).toContain('Foto borrosa')
    expect(h).not.toContain('<button')
  })
  it('a failed read is LoadFailed, an empty list says so', () => {
    expect(text(list({ items: null }))).toContain('No pudimos cargar esto')
    expect(text(list({ items: [] }))).toContain('No hay fotos rechazadas esta semana.')
  })
  it('long reasons and names wrap or truncate without overflow', () => {
    const h = list({ items: [item('beto', { reason: 'palabra '.repeat(30), displayName: 'Nombre larguísimo '.repeat(5) })] })
    expect(h).toContain('break-words')
    expect(h).toContain('truncate')
  })
})
