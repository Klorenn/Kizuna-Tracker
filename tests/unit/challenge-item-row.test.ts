import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/(app)/retos/actions', () => ({
  respondChallengeItem: vi.fn(),
  withdrawChallengeItem: vi.fn(),
}))

import { ChallengeItemRow } from '@/components/ChallengeItemRow'
import type { ItemRowData } from '@/lib/item-accept'

const item = (o: Partial<ItemRowData> = {}): ItemRowData => ({
  id: 'i1',
  status: 'proposed',
  pendingFor: 'me',
  myName: '',
  theirName: 'Pesas',
  target: 3,
  requiresPhoto: false,
  startsOn: null,
  ...o,
})
const habits = [{ id: 'h1', name: 'Gimnasio', requiresPhoto: false }]
const render = (i: ItemRowData) =>
  renderToStaticMarkup(createElement(ChallengeItemRow, { item: i, otherName: 'Ana', habits }))

describe('ChallengeItemRow', () => {
  it('pending for me: shows the proposal with Aceptar and Rechazar', () => {
    const html = render(item())
    expect(html).toContain('Pesas')
    expect(html).toContain('Ana lo propone')
    expect(html).toContain('3 por semana')
    expect(html).toContain('Aceptar')
    expect(html).toContain('Rechazar')
    expect(html).not.toContain('Retirar')
  })

  it('pending for them: only Retirar', () => {
    const html = render(item({ pendingFor: 'them', myName: 'Gym', theirName: '' }))
    expect(html).toContain('Esperando a Ana')
    expect(html).toContain('Retirar')
    expect(html).not.toContain('Aceptar')
    expect(html).not.toContain('Rechazar')
  })

  it('active: no actions', () => {
    const html = render(item({ status: 'active', pendingFor: null, myName: 'Gym', theirName: 'Pesas' }))
    expect(html).toContain('Gym · Pesas')
    expect(html).not.toContain('Aceptar')
    expect(html).not.toContain('Retirar')
  })

  it('buttons are touch sized', () => {
    expect(render(item())).toContain('h-12')
  })
})
