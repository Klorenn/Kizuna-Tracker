import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Avatar } from '@/components/ui/Avatar'

const html = (props: Parameters<typeof Avatar>[0]) => renderToStaticMarkup(createElement(Avatar, props))

describe('Avatar loading', () => {
  it('is lazy by default (lists, feed)', () => {
    expect(html({ name: 'Ana Uno', preset: 3 })).toContain('loading="lazy"')
  })
  it('loads eagerly with high priority above the fold (Perfil XL, /u header)', () => {
    const out = html({ name: 'Ana Uno', preset: 3, size: 'XL', priority: true })
    expect(out).toContain('loading="eager"')
    expect(out).toMatch(/fetchpriority="high"/i)
  })
})
