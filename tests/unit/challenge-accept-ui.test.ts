import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AcceptOptions, ProposalHabitLines } from '@/components/AcceptOptions'
import { CREATE_NEW } from '@/lib/challenge-accept'

const base = {
  otherName: 'Ana',
  proposedName: 'Valorant',
  createSubline: 'Hábito nuevo · 3 por semana',
  createSimple: false,
  onSelect: () => {},
}
const render = (props: Partial<Parameters<typeof AcceptOptions>[0]> & { habits: { id: string; name: string; requiresPhoto: boolean }[] }) =>
  renderToStaticMarkup(createElement(AcceptOptions, { ...base, canCreate: true, selected: CREATE_NEW, ...props }))
const radios = (html: string) => [...html.matchAll(/role="radio"[^>]*aria-checked="(true|false)"/g)].map((m) => m[1])

describe('AcceptOptions', () => {
  it('zero eligible habits: only "Crear", selected, no "Mis hábitos" label', () => {
    const html = render({ habits: [] })
    expect(radios(html)).toEqual(['true'])
    expect(html).toContain('Crear «Valorant»')
    expect(html).toContain('Hábito nuevo · 3 por semana')
    expect(html).not.toContain('Mis hábitos')
  })

  it('one habit: "Crear" first and selected, then "Mis hábitos" with the habit', () => {
    const html = render({ habits: [{ id: 'h1', name: 'Gimnasio', requiresPhoto: false }] })
    expect(radios(html)).toEqual(['true', 'false'])
    expect(html.indexOf('Crear «Valorant»')).toBeLessThan(html.indexOf('Mis hábitos'))
    expect(html.indexOf('Mis hábitos')).toBeLessThan(html.indexOf('Gimnasio'))
    expect(html).toContain('section-label')
  })

  it('several habits keep their order', () => {
    const html = render({
      habits: [
        { id: 'h1', name: 'Gimnasio', requiresPhoto: false },
        { id: 'h2', name: 'Estudiar Inglés', requiresPhoto: false },
      ],
    })
    expect(radios(html)).toEqual(['true', 'false', 'false'])
    expect(html.indexOf('Gimnasio')).toBeLessThan(html.indexOf('Estudiar Inglés'))
  })

  it('a same-name habit is selected and "Crear" is not shown', () => {
    const html = render({
      canCreate: false,
      selected: 'h2',
      habits: [
        { id: 'h1', name: 'Gimnasio', requiresPhoto: false },
        { id: 'h2', name: 'valorant', requiresPhoto: false },
      ],
    })
    expect(html).not.toContain('Crear «')
    expect(html).not.toContain('Hábito nuevo')
    expect(radios(html)).toEqual(['false', 'true'])
    expect(html).toContain('Mis hábitos')
  })

  it('the intro paragraph is the brief copy', () => {
    expect(render({ habits: [] })).toContain('Ana compite con «Valorant». Elige con cuál participas tú.')
  })

  it('says it before accepting when the habit will be "solo marcar"', () => {
    expect(render({ habits: [], createSimple: true })).toContain('Se creará como hábito de solo marcar.')
    expect(render({ habits: [] })).not.toContain('Se creará como hábito')
  })

  it('unreadable proposer habit: no "Crear", own habits only', () => {
    const html = render({ canCreate: false, sourceReadable: false, selected: 'h1', habits: [{ id: 'h1', name: 'Gimnasio', requiresPhoto: false }] })
    expect(html).not.toContain('Crear «')
    expect(html).toContain('Gimnasio')
    expect(html).not.toContain('compite con')
  })

  it('unreadable proposer habit and no habits: an error line, not a dead end', () => {
    const html = render({ canCreate: false, sourceReadable: false, selected: '', habits: [] })
    expect(html).not.toContain('Crear «')
    expect(html).toContain('role="alert"')
    expect(html).toContain('No pudimos cargar el hábito de este reto. Inténtalo de nuevo en unos minutos.')
  })

  it('options are 44 px touch targets', () => {
    expect(render({ habits: [] })).toContain('min-h-11')
  })
})

describe('ProposalHabitLines', () => {
  const lines = (over: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(ProposalHabitLines, {
        icon: 'target',
        name: 'Valorant',
        summary: '3 por semana · 4 semanas',
        kind: 'Solo marcar',
        requiresPhoto: false,
        ...over,
      } as never),
    )

  it('shows the icon before the name, the existing line and the kind of record', () => {
    const html = lines()
    expect(html).toContain('<svg')
    expect(html.indexOf('<svg')).toBeLessThan(html.indexOf('Valorant'))
    expect(html).toContain('Valorant · 3 por semana · 4 semanas')
    expect(html).toContain('Solo marcar')
    expect(html).not.toContain('Con foto')
  })

  it('adds "Con foto" when a photo is required, on the same extra line', () => {
    const html = lines({ kind: 'Lectura', requiresPhoto: true })
    expect(html).toContain('Lectura · Con foto')
    expect(html.match(/<p /g)).toHaveLength(2)
  })
})
