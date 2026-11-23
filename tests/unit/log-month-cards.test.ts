import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { LogMonthCards } from '@/components/logs/LogMonthCards'
import type { QuantityConfig } from '@/domain/quantity'
import { buildLogCards } from '@/lib/log-cards'

const agua: QuantityConfig = { unit: 'ml', label: null, target: 2000, step: 250, display: 'glasses', glassMl: 250 }
const pasos: QuantityConfig = { unit: 'steps', label: null, target: 8000, step: 1000, display: 'base', glassMl: 250 }

describe('LogMonthCards con varios hábitos de cantidad', () => {
  const cards = buildLogCards({
    month: '2026-11',
    reading: null,
    workout: null,
    visits: null,
    weights: [],
    quantity: [
      { habitId: 'h1', name: 'Agua', config: agua, entries: [{ date: '2026-11-02', amount: 1500 }], doneDates: [] },
      { habitId: 'h2', name: 'Caminar', config: pasos, entries: [{ date: '2026-11-02', amount: 6000 }], doneDates: [] },
    ],
  })

  test('las tarjetas de cantidad tienen enlaces distintos', () => {
    const q = cards.filter((c) => c.key === 'quantity')
    expect(q).toHaveLength(2)
    expect(new Set(q.map((c) => c.href)).size).toBe(2)
  })

  test('cada <li> lleva una clave React distinta', () => {
    const tree = LogMonthCards({ cards }) as ReactElement<{ children: ReactElement[] }>
    const keys = tree.props.children.map((li) => li.key)
    expect(keys).toHaveLength(2)
    expect(new Set(keys).size).toBe(2)
  })

  test('renderiza las dos tarjetas', () => {
    const html = renderToStaticMarkup(createElement(LogMonthCards, { cards }))
    expect(html).toContain('Agua')
    expect(html).toContain('Caminar')
  })
})
