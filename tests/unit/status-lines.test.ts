import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StatusLines } from '@/components/logs/StatusLines'

const html = (lines: string[], reserve = false) => renderToStaticMarkup(createElement(StatusLines, { lines, reserve }))

describe('StatusLines', () => {
  it('renders each line as its own paragraph, in order (the status under the cap copy)', () => {
    const h = html(['Cap copy.', 'Pendiente de sumar: 240 min.'])
    const ps = [...h.matchAll(/<p[^>]*>([^<]*)<\/p>/g)].map((m) => m[1])
    expect(ps).toEqual(['Cap copy.', 'Pendiente de sumar: 240 min.'])
  })
  it('reserves the second line, so pending to confirmed moves nothing', () => {
    const h = html(['Cap copy.'], true)
    const ps = [...h.matchAll(/<p([^>]*)>([^<]*)<\/p>/g)]
    expect(ps).toHaveLength(2)
    expect(ps[1][1]).toContain('min-h-5')
    expect(ps[1][2]).toBe(' ')
  })
  it('one line when nothing is reserved', () => {
    expect(html(['x']).match(/<p/g)).toHaveLength(1)
  })
})
