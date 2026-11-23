import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { HistoryList, WeekRowsView, loadWeekState } from '@/components/groups/detail/HistoryList'
import type { GroupWeek, GroupWeekRow } from '@/lib/groups-contract'

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const week = (weekStart: string, over: Partial<GroupWeek> = {}): GroupWeek => ({
  weekStart,
  targetPerWeek: 3,
  requiresPhoto: false,
  membersCounted: 12,
  membersComplied: 9,
  myComplied: true,
  ...over,
})
const wrow = (n: string, done: number, target = 3): GroupWeekRow => ({
  userId: `u-${n}`,
  username: n,
  displayName: n.toUpperCase(),
  avatarPath: null,
  avatarPreset: null,
  done,
  target,
  complied: done >= target,
})
const loadWeek = vi.fn()
const list = (weeks: GroupWeek[] | null) =>
  renderToStaticMarkup(createElement(HistoryList, { weeks, groupId: 'g1', actions: { loadWeek }, retryHref: '/grupos/g1', color: 'cielo' }))

describe('HistoryList', () => {
  it('failed read: retry line, not an empty history', () => {
    const h = list(null)
    expect(text(h)).toContain('No pudimos cargar esto')
    expect(text(h)).not.toContain('Semanas anteriores')
  })

  it('no closed weeks yet: says so under the label', () => {
    const h = list([])
    expect(text(h)).toContain('Semanas anteriores')
    expect(text(h)).toContain('Aún no hay semanas cerradas.')
  })

  it('each week: its range, "Cumplieron N de M" and the caller\'s own result', () => {
    const h = list([
      week('2026-11-16'),
      week('2026-11-09', { membersComplied: 4, myComplied: false }),
      week('2026-11-02', { myComplied: null }),
    ])
    const t = text(h)
    expect(t).toContain('16 nov al 22 nov')
    expect(t).toContain('Cumplieron 9 de 12')
    expect(t).toContain('Cumplieron 4 de 12')
    expect(t).toContain('Cumpliste')
    expect(t).toContain('No cumpliste')
    expect(t).toContain('Aún no estabas')
    expect(h.match(/<button/g)).toHaveLength(3)
    expect(h).toMatch(/font-mono[^>]*>9<\/span>/)
  })

  it('a week row is a 44 px target that says it opens the week', () => {
    const h = list([week('2026-11-16')])
    expect(h).toContain('aria-haspopup="dialog"')
    expect(h).toContain('min-h-11')
  })
})

describe('WeekRowsView (the week sheet body)', () => {
  const view = (state: Parameters<typeof WeekRowsView>[0]['state']) =>
    renderToStaticMarkup(createElement(WeekRowsView, { state, onRetry: () => {}, color: 'cielo' }))

  it('loading: a busy placeholder with a name, no rows', () => {
    const h = view({ status: 'loading' })
    expect(h).toContain('aria-busy="true"')
    expect(text(h)).toContain('Cargando…')
    expect(h).not.toContain('<li')
  })

  it('error: the message and a retry button', () => {
    const h = view({ status: 'error', error: 'No encontramos ese grupo.' })
    expect(text(h)).toContain('No encontramos ese grupo.')
    expect(h).toContain('role="alert"')
    expect(text(h)).toContain('Reintentar')
  })

  it('rows: name, @usuario, count and who complied; links to /@usuario', () => {
    const h = view({ status: 'ready', rows: [wrow('ana', 3), wrow('beto', 1)] })
    expect(h).toContain('href="/@ana"')
    expect(text(h)).toContain('3 de 3')
    expect(text(h)).toContain('1 de 3')
    expect(h.match(/Cumplió/g)).toHaveLength(1)
  })

  it('nothing but the contract fields is shown', () => {
    const leaky = { ...wrow('ana', 3), email: 'ana@secret.test', checkins: ['2026-11-17'] } as GroupWeekRow
    const h = view({ status: 'ready', rows: [leaky] })
    expect(h).not.toContain('secret.test')
    expect(h).not.toContain('2026-11-17')
  })
})

describe('loadWeekState', () => {
  it('ok → ready rows', async () => {
    const rows = [wrow('ana', 3)]
    const fn = vi.fn().mockResolvedValue({ ok: true, data: rows })
    expect(await loadWeekState(fn, 'g1', '2026-11-16')).toEqual({ status: 'ready', rows })
    expect(fn).toHaveBeenCalledWith('g1', '2026-11-16')
  })
  it('failed result → error with its copy', async () => {
    const fn = vi.fn().mockResolvedValue({ ok: false, error: 'No encontramos ese grupo.' })
    expect(await loadWeekState(fn, 'g1', 'w')).toEqual({ status: 'error', error: 'No encontramos ese grupo.' })
  })
  it('a thrown call → the connection error, never an unhandled rejection', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('offline'))
    const s = await loadWeekState(fn, 'g1', 'w')
    expect(s.status).toBe('error')
  })
})
