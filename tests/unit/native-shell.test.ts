import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
let ua: string | null = null
vi.mock('next/headers', () => ({ headers: async () => new Headers(ua ? { 'user-agent': ua } : {}) }))
vi.mock('@serwist/turbopack/react', () => ({ SerwistProvider: (p: { children: never }) => p.children }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => createElement('a', { href: p.href as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

import { isNativeUA, NATIVE_UA_MARKER } from '@/lib/native-shell'
import { HideInNative, NativeShellProvider } from '@/components/NativeShell'
import AppLayout from '@/app/(app)/layout'

const WEBVIEW_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36 KizunaNative/1'

describe('isNativeUA', () => {
  it('recognises the marker with a version, anywhere in the UA', () => {
    expect(NATIVE_UA_MARKER).toBe('KizunaNative')
    expect(isNativeUA(WEBVIEW_UA)).toBe(true)
    expect(isNativeUA('KizunaNative/12')).toBe(true)
  })
  it('is false for a browser, the TWA, a lookalike and no UA', () => {
    expect(isNativeUA('Mozilla/5.0 (Linux; Android 14) Chrome/126 Mobile Safari/537.36')).toBe(false)
    expect(isNativeUA('Mozilla/5.0 Chrome/126 Mobile Safari/537.36 TWA')).toBe(false)
    expect(isNativeUA('KizunaNativeX/1')).toBe(false)
    expect(isNativeUA('KizunaNative')).toBe(false)
    expect(isNativeUA(null)).toBe(false)
    expect(isNativeUA(undefined)).toBe(false)
  })
})

describe('HideInNative', () => {
  const child = createElement('span', null, 'push prompt')
  it('renders its children in a normal browser', () => {
    // eslint-disable-next-line react/no-children-prop
    expect(renderToStaticMarkup(createElement(NativeShellProvider, { native: false, children: createElement(HideInNative, null, child) }))).toBe('<span>push prompt</span>')
  })
  it('renders nothing inside the native app', () => {
    // eslint-disable-next-line react/no-children-prop
    expect(renderToStaticMarkup(createElement(NativeShellProvider, { native: true, children: createElement(HideInNative, null, child) }))).toBe('')
  })
  it('renders its children with no provider at all (the default is the web)', () => {
    expect(renderToStaticMarkup(createElement(HideInNative, null, child))).toBe('<span>push prompt</span>')
  })
})

describe('(app) layout', () => {
  const page = createElement('p', null, 'contenido')
  it('shows the bottom nav and its padding for a normal browser and the TWA', async () => {
    ua = 'Mozilla/5.0 (Linux; Android 14) Chrome/126 Mobile Safari/537.36'
    const html = renderToStaticMarkup(await AppLayout({ children: page }))
    expect(html).toContain('aria-label="Principal"')
    expect(html).toContain('pb-[calc(3.5rem')
  })
  it('hides the bottom nav and drops its padding for the marker UA', async () => {
    ua = WEBVIEW_UA
    const html = renderToStaticMarkup(await AppLayout({ children: page }))
    expect(html).toContain('contenido')
    expect(html).not.toContain('aria-label="Principal"')
    expect(html).not.toContain('pb-[calc(3.5rem')
  })
})
