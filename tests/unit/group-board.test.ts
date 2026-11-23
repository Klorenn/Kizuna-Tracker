import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BoardList, BoardRow } from '@/components/groups/detail/BoardList'
import { GroupChip } from '@/components/groups/GroupChip'
import type { GroupBoardRow } from '@/lib/groups-contract'

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const person = (n: string, name = n.toUpperCase()) => ({ userId: `u-${n}`, username: n, displayName: name, avatarPath: null, avatarPreset: null })
const row = (n: string, done: number, over: Partial<GroupBoardRow> = {}): GroupBoardRow => ({
  ...person(n),
  role: 'member',
  joinedOn: '2026-11-02',
  counts: true,
  done,
  target: 3,
  ...over,
})
const render = (rows: GroupBoardRow[] | null, myUserId = 'u-ana') =>
  renderToStaticMarkup(createElement(BoardList, { rows, myUserId, color: 'salvia', retryHref: '/grupos/g1' }))

describe('BoardList', () => {
  it('failed read: a retry line, never a false empty board', () => {
    const html = render(null)
    expect(text(html)).toContain('No pudimos cargar esto')
    expect(html).toContain('href="/grupos/g1"')
  })

  it('orders by progress then name, marks only the caller with "Tú"', () => {
    const html = render([row('zoe', 1), row('ana', 3), row('beto', 2)])
    const names = ['ANA', 'BETO', 'ZOE'].map((n) => html.indexOf(`>${n}<`))
    expect(names.every((i) => i > 0)).toBe(true)
    expect([...names].sort((a, b) => a - b)).toEqual(names)
    expect(html.match(/>Tú</g)).toHaveLength(1)
    expect(html.indexOf('>Tú<')).toBeGreaterThan(html.indexOf('>ANA<'))
    expect(html.indexOf('>Tú<')).toBeLessThan(html.indexOf('>BETO<'))
  })

  it('shows "N de M" in the mono face, "Cumplió" only when the week is done', () => {
    const html = render([row('ana', 3), row('beto', 2)])
    expect(text(html)).toContain('3 de 3')
    expect(text(html)).toContain('2 de 3')
    expect(html.match(/Cumplió/g)).toHaveLength(1)
    expect(html).toMatch(/font-mono[^>]*>3<\/span>/)
  })

  it('a member who starts next Monday reads "Empieza el lunes", with no count and no chip', () => {
    const html = render([row('lu', 0, { counts: false })])
    expect(text(html)).toContain('Empieza el lunes')
    expect(text(html)).not.toContain('0 de 3')
    expect(text(html)).not.toContain('Cumplió')
  })

  it('every row opens /@usuario and shows only name, @usuario and the week', () => {
    const leaky = { ...row('ana', 1), email: 'ana@secret.test', note: 'peso 60', habitName: 'Secreto', steps: 9999 } as GroupBoardRow
    const html = render([leaky])
    expect(html).toContain('href="/@ana"')
    expect(text(html)).toContain('@ana')
    for (const s of ['secret.test', 'peso 60', 'Secreto', '9999', '2026-11-02']) expect(html).not.toContain(s)
  })

  it('50 rows with long names stay in one line each and never wrap the layout (360 px)', () => {
    const long = 'Nombre larguísimo de una persona de verdad '.repeat(3)
    const rows = Array.from({ length: 50 }, (_, i) => row(`u${i}`, i % 4, { displayName: long }))
    const html = render(rows)
    expect(html.match(/<li/g)).toHaveLength(50)
    expect(html).toContain('truncate')
    expect(html).toContain('min-w-0')
    // the only arbitrary sizes in the markup are the existing Avatar's initials text
    expect([...new Set(html.match(/[\w-]+-\[\d+px\]/g))]).toEqual(['text-[12px]'])
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b/i)
  })

  it('progress segments follow the target and use the group colour token', () => {
    const html = render([row('ana', 2)])
    expect(html).toContain('data-habit-color="salvia"')
    expect(html.match(/bg-\(--habit\)/g)).toHaveLength(2)
  })

  it('each row is memoized, so one change does not re-render the other 49', () => {
    expect((BoardRow as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'))
  })
})

describe('GroupChip', () => {
  const html = (name: string, color = 'salvia') => renderToStaticMarkup(createElement(GroupChip, { name, color }))
  it('has the accessible name "Grupo <nombre>" and one truncated line', () => {
    const h = html('Gym del sur')
    expect(h).toContain('aria-label="Grupo Gym del sur"')
    expect(h).toContain('truncate')
    expect(h).toContain('data-habit-color="salvia"')
    expect(text(h)).toBe('Gym del sur')
  })
  it('a long name cannot widen the row, an unknown colour falls back to the default', () => {
    const h = html('x'.repeat(40), 'neon')
    expect(h).toContain('max-w-')
    expect(h).toContain('min-w-0')
    expect(h).toContain('data-habit-color="indigo"')
  })
  it('escapes the name', () => {
    expect(html('<b>x</b>')).not.toContain('<b>x</b>')
  })
})
