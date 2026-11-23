import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('@/app/(app)/amigos/actions', () => ({
  addFriendByUsername: vi.fn(),
  sendFriendRequest: vi.fn(),
  cancelFriendRequest: vi.fn(),
  declineFriendRequest: vi.fn(),
}))

const { PersonRow, metaLine } = await import('@/components/PersonRow')
const { DiscoverPersonRow, SentRequestRow } = await import('@/components/FriendActions')

const base = {
  id: 'u1',
  username: 'jose_n',
  displayName: 'José Núñez',
  avatarSrc: null,
  avatarPreset: 2,
  mutualCount: 0,
  relation: 'none' as 'none' | 'outgoing' | 'incoming',
  isNew: false,
}
const html = (over: Partial<typeof base> = {}) =>
  renderToStaticMarkup(createElement(DiscoverPersonRow, { person: { ...base, ...over } }))

describe('metaLine', () => {
  it('pluralises friends in common', () => {
    expect(metaLine({ mutualCount: 1, isNew: false })).toBe('1 amigo en común')
    expect(metaLine({ mutualCount: 2, isNew: false })).toBe('2 amigos en común')
  })
  it('puts friends in common before "Nuevo en Kizuna"', () => {
    expect(metaLine({ mutualCount: 3, isNew: true })).toBe('3 amigos en común')
    expect(metaLine({ mutualCount: 0, isNew: true })).toBe('Nuevo en Kizuna')
  })
  it('has no line otherwise', () => {
    expect(metaLine({ mutualCount: 0, isNew: false })).toBeNull()
  })
})

describe('PersonRow', () => {
  it('shows the name, the @usuario in the mono face and links the row to the profile', () => {
    const out = html()
    expect(out).toContain('José Núñez')
    expect(out).toMatch(/font-mono[^>]*>@jose_n</)
    expect(out).toContain('href="/@jose_n"')
  })

  it('keeps the action outside the link (a link never wraps a button)', () => {
    const out = html()
    const link = out.match(/<a [^>]*>[\s\S]*?<\/a>/)?.[0] ?? ''
    expect(link).not.toContain('<button')
  })

  it('reserves the meta line when there is nothing to say, so the row height is stable', () => {
    expect(html()).toContain('data-meta')
    expect(html({ mutualCount: 1 })).toContain('1 amigo en común')
  })

  it('never shows anything but the allowed fields', () => {
    const out = html({ mutualCount: 2 })
    for (const word of ['racha', 'hábito', 'amigos:', 'desde']) expect(out).not.toContain(word)
  })
})

describe('the action by relation', () => {
  it('none: Agregar', () => {
    const out = html()
    expect(out).toContain('Agregar')
    expect(out).not.toContain('Solicitud enviada')
  })
  it('outgoing: Solicitud enviada, no button to send again', () => {
    const out = html({ relation: 'outgoing' })
    expect(out).toContain('Solicitud enviada')
    expect(out).not.toContain('Agregar')
  })
  it('incoming: the accept and reject buttons', () => {
    const out = html({ relation: 'incoming' })
    expect(out).toContain('aria-label="Aceptar a José Núñez"')
    expect(out).toContain('aria-label="Rechazar a José Núñez"')
  })
  it('every action target is at least 44 px', () => {
    for (const relation of ['none', 'incoming'] as const) {
      const out = html({ relation })
      expect(out).toMatch(/\b(size-11|h-11!?)\b/)
    }
  })
})

describe('SentRequestRow', () => {
  it('offers Cancelar with the person in its accessible name and reserves no meta line', () => {
    const out = renderToStaticMarkup(createElement(SentRequestRow, { person: base }))
    expect(out).toContain('aria-label="Cancelar solicitud a José Núñez"')
    expect(out).not.toContain('data-meta')
  })
})

describe('PersonRow alone', () => {
  it('renders the slot it is given', () => {
    const out = renderToStaticMarkup(createElement(PersonRow, { person: base, action: createElement('i', null, 'slot') }))
    expect(out).toContain('<i>slot</i>')
  })
})
