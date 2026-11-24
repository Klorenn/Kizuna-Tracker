import { describe, expect, it } from 'vitest'
import { buildWidgetPayload, widgetKind, type WidgetRowInput } from '@/domain/widget-payload'

const row = (over: Partial<WidgetRowInput> = {}): WidgetRowInput => ({
  id: 'h1',
  name: 'Agua',
  done: false,
  logType: 'none',
  items: [],
  requiresPhoto: false,
  quantity: null,
  ...over,
})

describe('widgetKind', () => {
  it('toggle: hábito booleano simple', () => expect(widgetKind(row())).toBe('toggle'))
  it('open: con pasos', () => expect(widgetKind(row({ items: [{}] }))).toBe('open'))
  it('open: requiere foto', () => expect(widgetKind(row({ requiresPhoto: true }))).toBe('open'))
  it('open: cantidad', () =>
    expect(widgetKind(row({ logType: 'quantity', quantity: {} }))).toBe('open'))
  it.each(['reading', 'workout', 'time', 'watch', 'cardio'])('open: %s', (logType) =>
    expect(widgetKind(row({ logType }))).toBe('open'),
  )
  it('open: quantity no nulo aunque logType sea none', () =>
    expect(widgetKind(row({ quantity: {} }))).toBe('open'))
})

describe('buildWidgetPayload', () => {
  it('versión 1 con fecha, zona y contadores', () => {
    const rows = [row({ id: 'a', done: true }), row({ id: 'b' }), row({ id: 'c' })]
    expect(buildWidgetPayload({ rows, doneCount: 1, total: 3 }, '2026-11-24', 'America/Santiago')).toEqual({
      v: 1,
      date: '2026-11-24',
      timeZone: 'America/Santiago',
      done: 1,
      total: 3,
      pending: 2,
      habits: [
        { id: 'b', name: 'Agua', kind: 'toggle' },
        { id: 'c', name: 'Agua', kind: 'toggle' },
      ],
    })
  })
  it('solo pendientes, en el orden de Hoy, máximo 8', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row({ id: `h${i}`, name: `n${i}`, done: i === 0 }))
    const p = buildWidgetPayload({ rows, doneCount: 1, total: 12 }, '2026-11-24', 'UTC')
    expect(p.pending).toBe(11)
    expect(p.habits.map((h) => h.id)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8'])
  })
  it('mezcla kinds', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', requiresPhoto: true })]
    expect(buildWidgetPayload({ rows, doneCount: 0, total: 2 }, '2026-11-24', 'UTC').habits.map((h) => h.kind)).toEqual([
      'toggle',
      'open',
    ])
  })
  it('todo hecho: sin pendientes', () => {
    const p = buildWidgetPayload({ rows: [row({ done: true })], doneCount: 1, total: 1 }, '2026-11-24', 'UTC')
    expect(p).toMatchObject({ pending: 0, habits: [] })
  })
})
