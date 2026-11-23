import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fundDebtsForSection } from '@/app/(app)/deudas/fund-debts'
import { GroupFundsSection } from '@/components/debts/GroupFundsSection'
import { PrivacyContent } from '@/components/legal/PrivacyContent'
import { TermsContent } from '@/components/legal/TermsContent'
import { formatSignedCLP, netBalances } from '@/domain/ledger'
import type { MyFundDebts } from '@/lib/groups-fines-contract'

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
const render = (data: MyFundDebts | null) => renderToStaticMarkup(createElement(GroupFundsSection, { data }))

describe('Deudas: fund debts hand-off', () => {
  it('a successful read passes its data through untouched', () => {
    const data: MyFundDebts = { owed: [{ groupId: 'g1', groupName: 'Gym', pending: 2500 }], administered: [] }
    expect(fundDebtsForSection({ ok: true, data })).toBe(data)
  })

  it('a failed read becomes null, which the section renders as LoadFailed', () => {
    const data = fundDebtsForSection({ ok: false, error: 'x' })
    expect(data).toBeNull()
    expect(text(render(data))).toContain('No pudimos cargar esto')
  })

  it('hidden when nothing is pending', () => {
    expect(render(fundDebtsForSection({ ok: true, data: { owed: [], administered: [] } }))).toBe('')
  })

  it('shown when something is pending, each row linking to /grupos/<id>', () => {
    const h = render(
      fundDebtsForSection({
        ok: true,
        data: { owed: [{ groupId: 'g1', groupName: 'A', pending: 100 }], administered: [{ groupId: 'g2', groupName: 'B', pending: 200 }] },
      }),
    )
    expect(h).toContain('href="/grupos/g1?seccion=fondo"')
    expect(h).toContain('href="/grupos/g2?seccion=fondo"')
    expect(text(h)).toContain('La app solo registra. El pago se hace fuera de la app.')
  })

  it('the pairwise total does not depend on fund debts', () => {
    const ledger = [{ id: 'd1', debtorId: 'me', creditorId: 'b', amount: 1000, paidAt: null }]
    const total = [...netBalances(ledger, 'me').values()].reduce((a, b) => a + b, 0)
    expect(formatSignedCLP(total)).toBe(formatSignedCLP(-1000))
    const src = readFileSync('src/app/(app)/deudas/page.tsx', 'utf8')
    expect(src).toContain('loadMyFundDebts')
    expect(src).toContain('netBalances(ledger, user.id)')
    const ledgerBlock = src.slice(src.indexOf('const ledger'), src.indexOf('const balances'))
    expect(ledgerBlock).not.toMatch(/fund/i)
  })
})

describe('legal pages: fund paragraphs', () => {
  const privacy = text(renderToStaticMarkup(PrivacyContent()))
  const terms = text(renderToStaticMarkup(TermsContent()))

  it('privacy: admins can reject a photo and see the reason', () => {
    expect(privacy).toContain('Quienes administran un grupo pueden rechazar una foto')
    expect(privacy).toContain('el motivo lo ven esas personas y quien subió la foto')
  })

  it('terms: the fine is an agreement between members; Kizuna only records', () => {
    expect(terms).toContain('La multa de un grupo es un acuerdo entre sus miembros')
    expect(terms).toContain('Kizuna solo registra lo que cada persona debe al fondo del grupo y quién lo marcó como pagado')
    expect(terms).toContain('no cobra, no guarda, no transfiere ni garantiza dinero y no es parte de ese acuerdo')
  })

  it('no banned words', () => {
    for (const t of [privacy, terms]) expect(t.toLowerCase()).not.toMatch(/apuesta|\bbet\b|pozo/)
  })
})
