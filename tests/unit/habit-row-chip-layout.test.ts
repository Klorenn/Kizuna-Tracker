import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { buildToday } from '@/domain/today'

vi.mock('@/app/(app)/habitos/actions', () => ({ checkIn: vi.fn(), undoCheckIn: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }))
vi.mock('next/dynamic', () => ({ default: () => () => null }))

const { HabitRow } = await import('@/components/HabitRow')

const TODAY = '2026-11-25'
const view = buildToday({
  habits: [
    { id: 'a', name: 'Entrenar', icon: 'dumbbell', visibility: 'friends', requires_photo: false, frequency_type: 'weekly', target_per_week: 3 },
  ],
  items: [],
  checkins: [],
  itemChecks: [],
  today: TODAY,
  timeZone: 'America/Santiago',
})
const props = { row: view.rows[0], today: TODAY, timeZone: 'America/Santiago', checkinId: null }
const render = (group?: { name: string; color: string }) => renderToStaticMarkup(createElement(HabitRow, { ...props, group }))

const tag = (html: string, re: RegExp) => html.match(re)?.[0] ?? ''

describe('HabitRow: the group chip sits on the progress line, never beside the name', () => {
  const withChip = render({ name: 'Gimnasio del barrio', color: 'teal' })
  const without = render()
  const nameLine = () => tag(withChip, /<span class="flex min-w-0 items-center gap-2">[\s\S]*?<\/a>/)

  it('the name line holds the colour dot and the name only: the name never loses width to the chip', () => {
    expect(nameLine()).toContain('Entrenar')
    expect(nameLine()).not.toContain('Grupo ')
    // nothing but the dot and the name is between the name line and the progress line
    expect(withChip).toMatch(/Entrenar<\/a><\/span><span class="flex h-5 items-center/)
  })

  it('the chip is inside the fixed-height (h-5) progress line, after the subtitle', () => {
    const progress = tag(withChip, /<span class="flex h-5 items-center[^"]*">[\s\S]*$/)
    expect(progress).toContain('aria-label="Grupo Gimnasio del barrio"')
    expect(progress.indexOf('esta semana')).toBeGreaterThan(-1)
    expect(progress.indexOf('Grupo Gimnasio del barrio')).toBeGreaterThan(progress.indexOf('esta semana'))
  })

  it('the chip wrapper can shrink and truncate (min-w-0) and keeps its accessible name', () => {
    expect(withChip).toMatch(/<span class="[^"]*\bmin-w-0\b[^"]*\bshrink\b[^"]*"><span[^>]*aria-label="Grupo Gimnasio del barrio"/)
    expect(withChip).toContain('role="img"')
  })

  it('the progress line stays a single fixed-height line, so the chip causes no layout shift', () => {
    const open = tag(withChip, /<span class="flex h-5 items-center[^"]*">/)
    expect(open).toContain('h-5')
    expect(open).not.toMatch(/\bh-(?!5\b)\S+|min-h|flex-wrap/)
  })

  it('a row without a chip is exactly today: same lines, no chip markup, same height classes', () => {
    expect(without).not.toContain('Grupo ')
    expect(without).not.toContain('shrink-[8]')
    expect(tag(without, /<span class="flex h-5 items-center[^"]*">/)).toBe('<span class="flex h-5 items-center gap-1 text-small text-muted">')
    expect(tag(without, /<span class="flex min-w-0 items-center gap-2">[\s\S]*?<\/a>/)).toBe(nameLine())
    expect(without).toContain('min-h-[60px]')
  })

  it('a chip row clips inside its column instead of running under the right-hand action (min-w-0 overflow-hidden whitespace-nowrap)', () => {
    const open = tag(withChip, /<span class="flex h-5 items-center[^"]*">/)
    for (const c of ['min-w-0', 'overflow-hidden', 'whitespace-nowrap']) expect(open.split(/[\s"]+/)).toContain(c)
    expect(without).not.toContain('whitespace-nowrap')
  })

  it('no leftover shrink-[8] anywhere', () => expect(withChip).not.toContain('shrink-[8]'))
})
