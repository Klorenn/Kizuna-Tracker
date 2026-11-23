import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { createModalStack, createScrollLock, trapTarget } from '@/lib/modal-stack'
import { Sheet } from '@/components/ui/Sheet'

describe('modal stack', () => {
  it('only the last opened modal is on top; closing it hands the top back', () => {
    const s = createModalStack()
    const a = s.open()
    expect(s.isTop(a)).toBe(true)
    const b = s.open()
    expect(s.isTop(a)).toBe(false)
    expect(s.isTop(b)).toBe(true)
    s.close(b)
    expect(s.isTop(a)).toBe(true)
  })
  it('closing a lower modal keeps the upper one on top', () => {
    const s = createModalStack()
    const a = s.open()
    const b = s.open()
    s.close(a)
    expect(s.isTop(b)).toBe(true)
    s.close(b)
    expect(s.isTop(b)).toBe(false)
  })
})

describe('scroll lock', () => {
  it('locks on the first holder and restores after the last one releases (ref count)', () => {
    const style = { overflow: 'auto' }
    const lock = createScrollLock(() => style)
    const r1 = lock()
    expect(style.overflow).toBe('hidden')
    const r2 = lock()
    r1()
    expect(style.overflow).toBe('hidden')
    r1() // releasing twice is a no-op
    expect(style.overflow).toBe('hidden')
    r2()
    expect(style.overflow).toBe('auto')
  })
})

describe('trapTarget', () => {
  const items = ['a', 'b', 'c']
  it('wraps forward from the last and backward from the first', () => {
    expect(trapTarget(items, 'c', false)).toBe('a')
    expect(trapTarget(items, 'a', true)).toBe('c')
  })
  it('lets the browser move focus in the middle', () => {
    expect(trapTarget(items, 'b', false)).toBeNull()
    expect(trapTarget(items, 'b', true)).toBeNull()
  })
  it('pulls focus back in when it is outside (or on the dialog itself)', () => {
    expect(trapTarget(items, null, false)).toBe('a')
    expect(trapTarget(items, null, true)).toBe('c')
  })
  it('does nothing without focusable items', () => {
    expect(trapTarget([], null, false)).toBeNull()
  })
})

describe('Sheet on the server', () => {
  it('renders nothing and never touches document, even when it starts open', () => {
    const props = { open: true, title: 'Hola', onClose: () => {} } as Parameters<typeof Sheet>[0]
    const html = renderToStaticMarkup(createElement(Sheet, props, 'x'))
    expect(html).toBe('')
  })
})
