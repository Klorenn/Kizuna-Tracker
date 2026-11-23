import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { DayLogDetail, logEntryHref as reexported } from '@/components/logs/DayLogDetail'
import type { QuantityConfig } from '@/domain/quantity'
import { logEntryHref, timeLine, watchLine } from '@/lib/log-text'
import type { DayLog } from '@/lib/logs-data'

const config: QuantityConfig = { unit: 'ml', label: null, target: 2500, step: 250, display: 'base', glassMl: 250 }
const water: DayLog = { kind: 'quantity', total: 2000, target: 2500, config, entries: [{ amount: 2000, time: '8:10' }] }
const render = (props: { isToday: boolean; hasCheckin: boolean }) =>
  renderToStaticMarkup(
    createElement(DayLogDetail, { log: water, habitId: 'h1', logType: 'quantity', date: '2026-11-20', ...props }),
  )

describe('DayLogDetail: cantidad', () => {
  test('un día pasado con check-in muestra la cantidad sin "de <meta de hoy>"', () => {
    const html = render({ isToday: false, hasCheckin: true })
    expect(html).toContain('2.000 ml')
    expect(html).not.toContain(' de 2.500')
  })
  test('hoy y los días sin check-in sí muestran "de X"', () => {
    expect(render({ isToday: true, hasCheckin: true })).toContain('2.000 de 2.500 ml')
    expect(render({ isToday: false, hasCheckin: false })).toContain('2.000 de 2.500 ml')
  })
})

describe('log-text: módulo puro', () => {
  const src = (p: string) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8')
  test('no importa Supabase ni los lectores de logs-data', () => {
    const imports = (src('lib/log-text.ts').match(/^import .*$/gm) ?? []).join('\n')
    expect(imports).not.toMatch(/supabase|logs-data|next\/headers|server-only/)
    expect(imports).toMatch(/@\/domain\//)
  })
  test('DayLogDetail solo importa tipos de logs-data', () => {
    const imports = src('components/logs/DayLogDetail.tsx').match(/^import .*logs-data";$/gm) ?? []
    expect(imports.every((l) => l.startsWith('import type'))).toBe(true)
  })
  test('logEntryHref sigue disponible desde DayLogDetail', () => {
    expect(reexported).toBe(logEntryHref)
    expect(logEntryHref('h1', 'time', '2026-11-20')).toBe('/habitos/h1/tiempo?fecha=2026-11-20')
    expect(timeLine({ minutes: 60, topic: null, pomodoros: 0 })).toBe('1 h')
    expect(watchLine({ title: 'Dune', mediaKind: 'movie', episodes: null, season: null, episodeTo: null, minutes: 0, completed: true })).toBe('Dune · Completa')
  })
})
