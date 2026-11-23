import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => {}, refresh: () => {} }) }))
vi.mock('@/app/(auth)/login/actions', () => ({ signIn: vi.fn() }))

const { LoginForm } = await import('@/app/(auth)/login/LoginForm')

const createLink = (next: string | null) => {
  const html = renderToStaticMarkup(createElement(LoginForm, { next, profileMissing: false }))
  return html.match(/<a[^>]*href="([^"]*)"[^>]*>\s*Crea una/)?.[1]
}

describe('LoginForm: the "Crea una" link keeps the invitation', () => {
  it('with an invitation as the return path, the link carries it', () => {
    expect(createLink('/g/K7QM4PXD')).toBe('/registro?next=%2Fg%2FK7QM4PXD')
  })
  it('without a return path it is the bare /registro, as before', () => {
    expect(createLink(null)).toBe('/registro')
  })
  it.each(['https://evil.com', '//evil.com', '/hoy', '/g/k7qm4pxd'])('a hostile or rejected value (%s) never reaches the link', (v) => {
    expect(createLink(v)).toBe('/registro')
  })
})
