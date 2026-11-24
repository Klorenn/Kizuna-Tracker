import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const links: Array<Record<string, unknown>> = []
vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => {
    links.push(props)
    return createElement('a', { href: props.href as string }, props.children as never)
  },
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

const { BottomNav } = await import('@/components/BottomNav')

describe('BottomNav prefetch', () => {
  it('fully prefetches the five tabs (prefetch={true}, not the loading.tsx-only default)', () => {
    links.length = 0
    renderToStaticMarkup(createElement(BottomNav))
    expect(links.map((l) => l.href)).toEqual(['/', '/amigos', '/retos', '/resumen', '/perfil'])
    for (const l of links) expect(l.prefetch).toBe(true)
  })
})
