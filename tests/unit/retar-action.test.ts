import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RetarAction } from '@/components/friends/RetarAction'

const render = (open: { id: string; canAdd: boolean } | null) =>
  renderToStaticMarkup(createElement(RetarAction, { friendId: 'f1', openChallenge: open }))

describe('RetarAction', () => {
  it('no open challenge: Retar', () => {
    const html = render(null)
    expect(html).toContain('/retos/nuevo?amigo=f1')
    expect(html).toContain('Retar')
  })
  it('open challenge I can add to: Agregar sub-reto', () => {
    const html = render({ id: 'c1', canAdd: true })
    expect(html).toContain('/retos/nuevo?reto=c1')
    expect(html).toContain('Agregar sub-reto')
    expect(html).not.toContain('Ver reto')
  })
  it('open challenge I cannot add to: Ver reto', () => {
    const html = render({ id: 'c1', canAdd: false })
    expect(html).toContain('href="/retos/c1"')
    expect(html).toContain('Ver reto')
    expect(html).not.toContain('Agregar sub-reto')
  })
})
