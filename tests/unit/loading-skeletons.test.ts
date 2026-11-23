import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import ResumenLoading from '@/app/(app)/resumen/loading'
import HabitosLoading from '@/app/(app)/habitos/loading'

const html = (c: () => React.JSX.Element) => renderToStaticMarkup(createElement(c))

describe.each([
  ['resumen', ResumenLoading],
  ['habitos', HabitosLoading],
])('%s/loading.tsx', (_name, Loading) => {
  const out = html(Loading)

  test('is announced as busy, with a status outside the busy element', () => {
    expect(out).toContain('aria-busy="true"')
    expect(out).toMatch(/<p role="status" class="sr-only">Cargando<\/p>/)
    expect(out.indexOf('role="status"')).toBeLessThan(out.indexOf('aria-busy'))
  })

  test('pulses slowly and stops for reduced motion', () => {
    expect(out).toContain('animate-pulse')
    expect(out).toContain('motion-reduce:animate-none')
  })

  test('is faint: only the hairline, field and card-surface tokens, never a dark or accent block', () => {
    const fills = [...out.matchAll(/\bbg-([a-z-]+)(?:\/\d+)?/g)].map((m) => m[1])
    expect(fills.length).toBeGreaterThan(0)
    for (const f of fills) expect(['line', 'field', 'surface']).toContain(f)
  })

  test('is shaped like the screen: a title, cards and no real data', () => {
    expect(out).toContain('max-w-md')
    expect((out.match(/rounded-md bg-line/g) ?? []).length).toBeGreaterThan(5)
    expect(out).not.toMatch(/<h1/)
    expect(out).not.toMatch(/<a /)
  })
})
