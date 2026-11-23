import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { WeekBars } from '@/components/charts/WeekBars'

const html = (values: number[]) =>
  renderToStaticMarkup(
    createElement(WeekBars, {
      data: values.map((value, i) => ({ weekStart: `2026-11-${String(2 + i * 7).padStart(2, '0')}`, value })),
      color: 'cielo',
      format: (n: number) => String(n),
      label: 'Total por semana',
    }),
  )

describe('WeekBars', () => {
  test('un mes sin datos dice que no hay datos, sin barras ni gráfico vacío', () => {
    const out = html([0, 0, 0, 0])
    expect(out).toContain('Sin datos')
    expect(out).not.toContain('role="img"')
    expect(out).not.toContain('NaN')
  })
  test('con datos dibuja el gráfico con su nombre accesible', () => {
    const out = html([0, 5, 2, 0])
    expect(out).toContain('role="img"')
    expect(out).toContain('aria-label="Total por semana: S45 0, S46 5, S47 2, S48 0"')
  })
})
