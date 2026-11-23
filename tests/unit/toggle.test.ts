import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Toggle } from '@/components/ui/Toggle'

const html = (touch?: boolean) =>
  renderToStaticMarkup(createElement(Toggle, { checked: true, onChange: () => {}, label: 'x', touch }))
const button = (h: string) => h.match(/<button[^>]*class="([^"]*)"/)![1]

describe('Toggle touch target', () => {
  it('with touch: at least 44 px high and never narrower than the 51 px switch it wraps', () => {
    const c = button(html(true))
    expect(c).toContain('h-11')
    expect(c).not.toMatch(/(^| )size-11( |$)/)
    expect(c).not.toMatch(/(^| )w-11( |$)/)
    expect(c).toContain('min-w-11') // width follows the 51 px track inside, never below 44
    expect(html(true)).toContain('w-[51px]')
  })
  it('without touch: the drawn switch is the button, unchanged', () => {
    const c = button(html())
    expect(c).toContain('h-[31px]')
    expect(c).toContain('w-[51px]')
  })
})
