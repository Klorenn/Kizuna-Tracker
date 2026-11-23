import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import AppError from '@/app/(app)/error'
import RootError from '@/app/error'

describe('(app)/error.tsx', () => {
  const out = renderToStaticMarkup(createElement(AppError, { error: new Error('x'), reset: () => {} }))

  test('says the same as the root error page and offers a retry', () => {
    const root = renderToStaticMarkup(createElement(RootError, { error: new Error('x'), reset: () => {} }))
    const copy = (h: string) => h.match(/<p[^>]*>([^<]+)<\/p>/)?.[1]
    expect(copy(out)).toBe('Algo salió mal. Inténtalo de nuevo en unos minutos.')
    expect(copy(out)).toBe(copy(root))
    expect(out).toContain('Reintentar')
  })

  test('lives inside the app shell: no full-screen takeover, tokens only', () => {
    expect(out).not.toContain('min-h-dvh')
    expect(out).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
