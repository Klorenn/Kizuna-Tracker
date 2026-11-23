import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LoadFailed } from '@/components/LoadFailed'

describe('LoadFailed', () => {
  const html = renderToStaticMarkup(createElement(LoadFailed, { href: '/perfil' }))

  it('is one quiet line with the agreed copy and a retry link to the same page', () => {
    expect(html).toContain('No pudimos cargar esto. Inténtalo de nuevo.')
    expect(html).toMatch(/<a [^>]*href="\/perfil"[^>]*>Reintentar<\/a>/)
  })

  it('is announced politely, not as an alert', () => {
    expect(html).toContain('role="status"')
    expect(html).not.toContain('role="alert"')
  })
})
