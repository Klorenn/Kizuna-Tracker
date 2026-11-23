import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GroupFundsSection } from '@/components/debts/GroupFundsSection'
import type { MyFundDebts } from '@/lib/groups-fines-contract'

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const RULE = 'La app solo registra. El pago se hace fuera de la app.'
const render = (data: MyFundDebts | null) => renderToStaticMarkup(createElement(GroupFundsSection, { data }))

describe('GroupFundsSection (Deudas)', () => {
  it('a failed read is LoadFailed pointing at /deudas, never $0', () => {
    const h = render(null)
    expect(text(h)).toContain('Fondos de grupo')
    expect(text(h)).toContain('No pudimos cargar esto')
    expect(h).toContain('href="/deudas"')
    expect(text(h)).not.toContain('$0')
  })

  it('what I owe: "Le debes $X al fondo de <grupo>" linking to the group, in the mono face', () => {
    const h = render({ owed: [{ groupId: 'g1', groupName: 'Gym del sur', pending: 2500 }], administered: [] })
    expect(text(h)).toContain('Le debes $2.500 al fondo de Gym del sur')
    expect(h).toContain('href="/grupos/g1?seccion=fondo"')
    expect(h).toContain('font-mono')
  })

  it('what the groups I administer have pending', () => {
    const h = render({ owed: [], administered: [{ groupId: 'g2', groupName: 'Lectura', pending: 7500 }] })
    expect(text(h)).toContain('Lectura: $7.500 pendiente en el fondo')
  })

  it('shows the rule line wherever an amount is shown', () => {
    expect(text(render({ owed: [{ groupId: 'g1', groupName: 'A', pending: 100 }], administered: [] }))).toContain(RULE)
    expect(text(render({ owed: [], administered: [{ groupId: 'g1', groupName: 'A', pending: 100 }] }))).toContain(RULE)
  })

  it('nothing pending anywhere: the section is absent', () => {
    expect(render({ owed: [], administered: [] })).toBe('')
    expect(render({ owed: [{ groupId: 'g1', groupName: 'A', pending: 0 }], administered: [{ groupId: 'g2', groupName: 'B', pending: 0 }] })).toBe('')
  })

  it('long group names truncate instead of overflowing', () => {
    const h = render({ owed: [{ groupId: 'g1', groupName: 'Nombre larguísimo '.repeat(8), pending: 100 }], administered: [] })
    expect(h).toContain('break-words')
  })

  it('rows are links with a 44 px target', () => {
    const h = render({ owed: [{ groupId: 'g1', groupName: 'A', pending: 100 }], administered: [] })
    expect(h).toContain('min-h-11')
  })
})
