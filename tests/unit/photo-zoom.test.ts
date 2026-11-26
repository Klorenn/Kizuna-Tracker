import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Avatar } from '@/components/ui/Avatar'
import { ZoomablePhoto } from '@/components/ui/PhotoZoom'

describe('photos open large', () => {
  it('a profile photo is a button, initials are not', () => {
    const photo = renderToStaticMarkup(createElement(Avatar, { name: 'Ana Uno', preset: 3 }))
    expect(photo).toContain('aria-label="Ver foto de Ana Uno"')
    expect(photo).toContain('<button')
    const letters = renderToStaticMarkup(createElement(Avatar, { name: 'Ana Uno' }))
    expect(letters).not.toContain('<button')
    expect(letters).toContain('AU')
  })

  it('a proof photo names the large view', () => {
    const html = renderToStaticMarkup(
      createElement(ZoomablePhoto, { src: 'https://example.test/a.jpg', alt: 'Foto de Agua', className: 'absolute inset-0', imgClassName: 'size-full object-cover' }),
    )
    expect(html).toContain('aria-label="Ver en grande: Foto de Agua"')
    expect(html).toContain('src="https://example.test/a.jpg"')
  })
})
