import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/app/(app)/registros/quantity-actions', () => ({
  addQuantity: vi.fn(),
  removeQuantity: vi.fn(),
  refreshQuantity: vi.fn(),
}))

import { QuantityStatus } from '@/components/logs/QuantityControl'
import type { QuantityConfig } from '@/domain/quantity'

const water: QuantityConfig = { unit: 'ml', label: null, target: 2000, step: 250, display: 'glasses', glassMl: 250 }
const render = (over: Partial<Parameters<typeof QuantityStatus>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(QuantityStatus, {
      config: water,
      shown: 0,
      confirmed: 0,
      serverDone: false,
      pending: 0,
      rejection: null,
      offline: null,
      onDismiss: () => {},
      ...over,
    }),
  )

const OFFLINE = 'Sin conexión. Guardaremos la suma cuando vuelvas a estar en línea.'

describe('QuantityStatus: rejection, offline and pending are separate', () => {
  it('a rejection followed by a network failure shows both, and the pending count', () => {
    const html = render({ shown: 750, confirmed: 500, pending: 1, rejection: 'Es demasiado para un día.', offline: OFFLINE })
    expect(html).toContain('Es demasiado para un día.')
    expect(html).toContain(OFFLINE)
    expect(html).toContain('1 suma pendiente de guardar')
  })

  it('shows the pending count whenever it is above zero, with or without messages', () => {
    expect(render({ pending: 3 })).toContain('3 sumas pendientes de guardar')
    expect(render({ pending: 2, offline: OFFLINE })).toContain('2 sumas pendientes de guardar')
    expect(render({ pending: 2, rejection: 'Revisa la cantidad.' })).toContain('2 sumas pendientes de guardar')
    expect(render({ pending: 0 })).not.toContain('pendiente')
  })

  it('a rejection can be dismissed', () => {
    expect(render({ rejection: 'Revisa la cantidad.' })).toContain('aria-label="Cerrar aviso"')
    expect(render()).not.toContain('Cerrar aviso')
  })
})

describe('QuantityStatus: goal met follows the confirmed total', () => {
  it('does not show "Meta de hoy cumplida" when only the optimistic number reached the goal', () => {
    const html = render({ shown: 2000, confirmed: 1750, pending: 1 })
    expect(html).toContain('8 de 8 vasos')
    expect(html).not.toContain('Meta de hoy cumplida')
  })

  it('shows it once the confirmed total reaches the goal, inside the live region', () => {
    const html = render({ shown: 2000, confirmed: 2000 })
    expect(html).toContain('Meta de hoy cumplida')
    const live = html.slice(html.indexOf('aria-live="polite"'))
    expect(live).toContain('Meta de hoy cumplida')
  })

  it('shows it when the server says the day is done', () => {
    expect(render({ shown: 0, confirmed: 0, serverDone: true })).toContain('Meta de hoy cumplida')
  })
})

describe('QuantityStatus: parts (notices live under the buttons, so a new line never moves them)', () => {
  const busy = { shown: 250, pending: 1, rejection: 'Revisa la cantidad.', offline: OFFLINE }
  it('head: the number and ring, none of the notices', () => {
    const html = render({ ...busy, part: 'head' })
    expect(html).toContain('de 8 vasos')
    expect(html).not.toContain('pendiente')
    expect(html).not.toContain(OFFLINE)
    expect(html).not.toContain('Revisa la cantidad.')
  })
  it('notices: the three lines, no number', () => {
    const html = render({ ...busy, part: 'notices' })
    expect(html).toContain('1 suma pendiente de guardar')
    expect(html).toContain(OFFLINE)
    expect(html).toContain('Revisa la cantidad.')
    expect(html).not.toContain('de 8 vasos')
  })
})
