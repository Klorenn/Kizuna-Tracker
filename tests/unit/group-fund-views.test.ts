import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ActiveFineCard } from '@/components/groups/fund/ActiveFineCard'
import { FundDebtRow } from '@/components/groups/fund/FundDebtRow'
import { FundPeople } from '@/components/groups/fund/FundPeople'
import { FineUpdating, FundSection } from '@/components/groups/fund/FundSection'
import { FundTotals } from '@/components/groups/fund/FundTotals'
import { ProposalForm } from '@/components/groups/fund/ProposalSheet'
import { VoteCard } from '@/components/groups/fund/VoteCard'
import type {
  GroupFineActive,
  GroupFineProposal,
  GroupFineState,
  GroupFund,
  GroupFundDebt,
} from '@/lib/groups-fines-contract'

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const NOW = Date.parse('2026-11-25T12:00:00Z')
const RULE = 'La app solo registra. El pago se hace fuera de la app.'

const person = (n: string) => ({ userId: `u-${n}`, username: n, displayName: n.toUpperCase(), avatarPath: null, avatarPreset: null })
const proposal: GroupFineProposal = {
  id: 'f1',
  amount: 2500,
  purpose: 'Asado de fin de mes',
  proposedByName: 'Ana',
  expiresAt: '2026-11-30T12:00:00Z',
  acceptedCount: 2,
  neededCount: 3,
  myVote: null,
}
const active: GroupFineActive = {
  id: 'f0',
  amount: 2500,
  purpose: 'Asado',
  startsOn: '2026-11-23',
  endsOn: null,
  boundCount: 4,
  iAmBound: true,
  myBoundFrom: '2026-11-23',
  myBoundUntil: null,
}
const debt = (n: string, over: Partial<GroupFundDebt> = {}): GroupFundDebt => ({
  ...person(n),
  debtId: `d-${n}`,
  weekStart: '2026-11-16',
  amount: 2500,
  paidAt: null,
  paidByName: null,
  mine: false,
  ...over,
})
const fund: GroupFund = {
  totals: { registered: 7500, paid: 2500, pending: 5000 },
  people: [{ ...person('beto'), pending: 5000 }],
  debts: [debt('beto'), debt('cami', { paidAt: '2026-11-20T10:00:00Z', paidByName: 'Ana' })],
}
const state = (over: Partial<GroupFineState> = {}): GroupFineState => ({ active: null, proposal: null, singleAdmin: false, ...over })
const actions = {
  propose: vi.fn(),
  vote: vi.fn(),
  acceptActive: vi.fn(),
  stepOut: vi.fn(),
  end: vi.fn(),
  setDebtPaid: vi.fn(),
}
const section = (o: { state?: GroupFineState | null; fund?: GroupFund | null; role?: 'admin' | 'member'; archived?: boolean; me?: string } = {}) =>
  renderToStaticMarkup(
    createElement(FundSection, {
      groupId: 'g1',
      state: o.state === undefined ? state() : o.state,
      fund: o.fund === undefined ? fund : o.fund,
      role: o.role ?? 'member',
      archived: o.archived ?? false,
      myUserId: o.me ?? 'u-zed',
      retryHref: '/grupos/g1',
      now: NOW,
      onChanged: () => {},
      actions,
    }),
  )

describe('FundTotals', () => {
  it('Registrado, Pagado, Pendiente with amounts in the mono face', () => {
    const h = renderToStaticMarkup(createElement(FundTotals, { totals: fund.totals }))
    const t = text(h)
    expect(t).toContain('Registrado $7.500')
    expect(t).toContain('Pagado $2.500')
    expect(t).toContain('Pendiente $5.000')
    expect(h).toContain('font-mono')
    expect(h).toContain('flex-wrap')
  })

  it('the layout itself is safe: items wrap, keep their content width and never break an amount', () => {
    const wide = renderToStaticMarkup(createElement(FundTotals, { totals: { registered: 10000000, paid: 10000000, pending: 10000000 } }))
    expect(text(wide)).toContain('Registrado $10.000.000')
    expect(text(wide)).toContain('Pagado $10.000.000')
    expect(text(wide)).toContain('Pendiente $10.000.000')
    expect(wide).toContain('flex-wrap')
    expect(wide.match(/min-w-fit/g)).toHaveLength(3)
    expect(wide.match(/whitespace-nowrap/g)!.length).toBeGreaterThanOrEqual(3)
    expect(wide).not.toContain('truncate')
    expect(wide).not.toContain('grid-cols')
  })
})

describe('FundPeople', () => {
  it('names the people with "Debe $X" and nothing else of them', () => {
    const leaky = { ...fund.people[0], email: 'b@secret.test' } as unknown as GroupFund['people'][number]
    const h = renderToStaticMarkup(createElement(FundPeople, { people: [leaky] }))
    expect(text(h)).toContain('BETO')
    expect(text(h)).toContain('Debe $5.000')
    expect(h).not.toContain('secret.test')
  })
  it('renders nothing when nobody owes', () => {
    expect(renderToStaticMarkup(createElement(FundPeople, { people: [] }))).toBe('')
  })
})

describe('FundDebtRow', () => {
  const row = (d: GroupFundDebt, o: { canMark?: boolean; pending?: boolean; error?: string | null } = {}) =>
    renderToStaticMarkup(
      createElement(FundDebtRow, { debt: d, canMark: o.canMark ?? false, pending: o.pending ?? false, error: o.error ?? null, onToggle: () => {} }),
    )

  it('pending debt: week and amount, "Pendiente" as text with an icon (not colour alone)', () => {
    const h = row(debt('beto'))
    expect(text(h)).toContain('Semana del 16 nov · $2.500')
    expect(text(h)).toContain('Pendiente')
    expect(h).toContain('<svg')
  })

  it('paid debt shows who marked it', () => {
    expect(text(row(debt('cami', { paidAt: '2026-11-20T10:00:00Z', paidByName: 'Ana' })))).toContain('Pagada · marcó Ana')
  })

  it('the mark control exists only when allowed, with the right label', () => {
    expect(row(debt('beto'))).not.toContain('<button')
    expect(text(row(debt('beto'), { canMark: true }))).toContain('Marcar como pagada')
    expect(text(row(debt('cami', { paidAt: '2026-11-20T10:00:00Z', paidByName: 'Ana' }), { canMark: true }))).toContain('Desmarcar')
  })

  it('pending disables the control; an error is shown with the alert role', () => {
    expect(row(debt('beto'), { canMark: true, pending: true })).toMatch(/<button[^>]*disabled/)
    expect(row(debt('beto'), { canMark: true, error: 'Otro administrador debe marcar tu deuda.' })).toContain('role="alert"')
  })

  it('the week and amount line wraps instead of cutting the amount', () => {
    const h = row(debt('beto', { amount: 10000000 }))
    expect(text(h)).toContain('Semana del 16 nov · $10.000.000')
    const line = h.match(/<span class="[^"]*">Semana del[^]*?<\/span><\/span>/)?.[0] ?? ''
    expect(line).not.toContain('truncate')
  })

  it('touch target of 44 px and long names truncate', () => {
    const h = row(debt('beto', { displayName: 'Nombre larguísimo '.repeat(6) }), { canMark: true })
    expect(h).toContain('h-11')
    expect(h).toContain('truncate')
  })
})

describe('VoteCard', () => {
  const card = (p: GroupFineProposal, o: { canVote?: boolean; pending?: boolean; error?: string | null } = {}) =>
    renderToStaticMarkup(createElement(VoteCard, { proposal: p, canVote: o.canVote ?? true, pending: o.pending ?? false, error: o.error ?? null, onVote: () => {}, now: NOW }))

  it('not voted: proposal copy, progress and both options', () => {
    const t = text(card(proposal))
    expect(t).toContain('Ana propone una multa de $2.500 por semana incumplida')
    expect(t).toContain('Fondo: Asado de fin de mes')
    expect(t).toContain('Aceptaron 2 de 3 necesarios')
    expect(t).toContain('Aceptar')
    expect(t).toContain('No participar')
  })

  it('voted: the status and "Cambiar" replace the two options', () => {
    const yes = text(card({ ...proposal, myVote: true }))
    expect(yes).toContain('Aceptaste')
    expect(yes).toContain('Cambiar')
    expect(yes).not.toContain('No participar')
    expect(text(card({ ...proposal, myVote: false }))).toContain('No participas')
  })

  it('both states keep the same control height (no layout shift)', () => {
    const a = card(proposal)
    const b = card({ ...proposal, myVote: true })
    expect(a).toContain('min-h-12')
    expect(b).toContain('min-h-12')
  })

  it('pending disables the buttons', () => {
    expect(card(proposal, { pending: true }).match(/<button[^>]*disabled/g)).toHaveLength(2)
  })

  it('read-only (archived): no buttons at all', () => {
    expect(card(proposal, { canVote: false })).not.toContain('<button')
  })

  it('past its expiry: "La votación terminó." and no buttons, voted or not', () => {
    const late = renderToStaticMarkup(
      createElement(VoteCard, { proposal, canVote: true, pending: false, error: null, onVote: () => {}, now: Date.parse('2026-11-30T12:00:00Z') }),
    )
    expect(text(late)).toContain('La votación terminó.')
    expect(late).not.toContain('<button')
    const lateVoted = renderToStaticMarkup(
      createElement(VoteCard, { proposal: { ...proposal, myVote: true }, canVote: true, pending: false, error: null, onVote: () => {}, now: Date.parse('2026-12-01T00:00:00Z') }),
    )
    expect(lateVoted).not.toContain('<button')
    expect(text(card(proposal))).not.toContain('La votación terminó.')
  })

  it('an error shows where the vote was cast', () => {
    expect(card(proposal, { error: 'Esa votación ya terminó.' })).toContain('role="alert"')
  })
})

describe('ActiveFineCard', () => {
  const card = (a: GroupFineActive, o: { canChange?: boolean; canEnd?: boolean; pending?: boolean; error?: string | null } = {}) =>
    renderToStaticMarkup(
      createElement(ActiveFineCard, {
        active: a,
        canChange: o.canChange ?? true,
        canEnd: o.canEnd ?? false,
        pending: o.pending ?? false,
        error: o.error ?? null,
        onAccept: () => {},
        onStepOut: () => {},
        onEnd: () => {},
      }),
    )

  it('bound: amount, purpose, participants and since when, with the way out', () => {
    const t = text(card(active))
    expect(t).toContain('Multa activa: $2.500 por semana incumplida')
    expect(t).toContain('Fondo: Asado')
    expect(t).toContain('Participan 4')
    expect(t).toContain('Participas desde el lunes 23 nov')
    expect(t).toContain('Dejar de participar')
    expect(t).not.toContain('Terminar multa')
  })

  it('not bound: "No participas" and the way in', () => {
    const t = text(card({ ...active, iAmBound: false, myBoundFrom: null }))
    expect(t).toContain('No participas')
    expect(t).toContain('Sumarme desde el próximo lunes')
    expect(t).not.toContain('Dejar de participar')
  })

  it('admins get "Terminar multa"; an already ended fine does not', () => {
    expect(text(card(active, { canEnd: true }))).toContain('Terminar multa')
    const ended = text(card({ ...active, endsOn: '2026-12-07' }, { canEnd: true }))
    expect(ended).not.toContain('Terminar multa')
    expect(ended).toContain('La multa termina el lunes 7 dic')
  })

  it('stepping out already scheduled: no further controls', () => {
    const t = text(card({ ...active, myBoundUntil: '2026-12-07' }))
    expect(t).toContain('Participas hasta el lunes 7 dic')
    expect(t).not.toContain('Dejar de participar')
    expect(t).not.toContain('Sumarme')
  })

  it('read-only: no buttons', () => {
    expect(card(active, { canChange: false })).not.toContain('<button')
  })

  it('pending disables the buttons', () => {
    expect(card(active, { canEnd: true, pending: true }).match(/<button[^>]*disabled/g)).toHaveLength(2)
  })
})

describe('ProposalForm', () => {
  const form = (o: { singleAdmin?: boolean; pending?: boolean; error?: string | null } = {}) =>
    renderToStaticMarkup(createElement(ProposalForm, { singleAdmin: o.singleAdmin ?? false, pending: o.pending ?? false, error: o.error ?? null, onSubmit: () => {} }))

  it('has the binding labels, placeholder, note and submit', () => {
    const h = form()
    const t = text(h)
    expect(t).toContain('Monto por semana incumplida (CLP)')
    expect(t).toContain('¿Para qué es el fondo?')
    expect(h).toContain('placeholder="Asado de fin de mes"')
    expect(t).toContain('Se activa si acepta al menos la mitad del grupo en 7 días. Solo obliga a quienes acepten.')
    expect(t).toContain('Proponer')
    expect(h).toContain('inputMode="numeric"')
  })

  it('the single admin note appears only for a single admin', () => {
    expect(text(form({ singleAdmin: true }))).toContain('Eres el único administrador: nadie podrá rechazar tus fotos.')
    expect(text(form())).not.toContain('único administrador')
  })

  it('pending disables the fields and the submit', () => {
    const h = form({ pending: true })
    expect(text(h)).toContain('Proponiendo…')
    expect(h.match(/<(input|button)[^>]*disabled/g)!.length).toBeGreaterThanOrEqual(3)
  })

  it('shows the server error', () => {
    expect(form({ error: 'Ya hay una propuesta de multa en votación.' })).toContain('role="alert"')
  })
})

describe('FundSection', () => {
  it('no fine: the empty line, and "Proponer multa" only for admins of a live group', () => {
    expect(text(section())).toContain('Este grupo no tiene multa.')
    expect(text(section())).not.toContain('Proponer multa')
    expect(text(section({ role: 'admin' }))).toContain('Proponer multa')
    expect(text(section({ role: 'admin', archived: true }))).not.toContain('Proponer multa')
  })

  it('with no fine and nothing registered, no money is shown', () => {
    const h = section({ fund: { totals: { registered: 0, paid: 0, pending: 0 }, people: [], debts: [] } })
    expect(text(h)).not.toContain('Registrado')
  })

  it('a null state or fund is LoadFailed, never $0', () => {
    const noState = section({ state: null })
    expect(text(noState)).toContain('No pudimos cargar esto')
    expect(noState).toContain('href="/grupos/g1"')
    const noFund = section({ state: state({ active }), fund: null })
    expect(text(noFund)).toContain('No pudimos cargar esto')
    expect(text(noFund)).not.toContain('$0')
    expect(text(noFund)).toContain('Multa activa')
  })

  it('the vote card is present only with an open proposal', () => {
    expect(text(section({ state: state({ proposal }) }))).toContain('Aceptaron 2 de 3 necesarios')
    expect(text(section())).not.toContain('Aceptaron')
  })

  it('an expired proposal shows no vote buttons', () => {
    const h = renderToStaticMarkup(
      createElement(FundSection, { groupId: 'g1', state: state({ proposal }), fund, role: 'member', archived: false, myUserId: 'u-zed', retryHref: '/grupos/g1', now: Date.parse('2026-12-02T00:00:00Z'), onChanged: () => {}, actions }),
    )
    expect(text(h)).toContain('La votación terminó.')
    expect(h).not.toContain('No participar')
  })

  it('while fresh data is awaited the fine area is neutral: "Actualizando…" and no controls', () => {
    const h = renderToStaticMarkup(createElement(FineUpdating))
    expect(text(h)).toContain('Actualizando…')
    expect(h).toContain('role="status"')
    expect(h).not.toContain('<button')
  })

  it('an open proposal hides "Proponer multa" (one at a time)', () => {
    expect(text(section({ role: 'admin', state: state({ proposal }) }))).not.toContain('Proponer multa')
  })

  it('active fine with the fund: totals, people, debts and the rule line', () => {
    const t = text(section({ state: state({ active }) }))
    expect(t).toContain('Multa activa')
    expect(t).toContain('Registrado $7.500')
    expect(t).toContain('Debe $5.000')
    expect(t).toContain('Semana del 16 nov · $2.500')
    expect(t).toContain(RULE)
  })

  it('the rule line is present wherever an amount owed is shown', () => {
    const noFine = section({ fund })
    expect(text(noFine)).toContain('Registrado')
    expect(text(noFine)).toContain(RULE)
  })

  it('mark-as-paid: admins only, never on their own debt unless single admin', () => {
    const f: GroupFund = { ...fund, debts: [debt('beto'), debt('ana', { mine: true })] }
    const base = { state: state({ active }), fund: f, me: 'u-ana' }
    expect(section({ ...base, role: 'member' })).not.toContain('Marcar como pagada')
    const admin = section({ ...base, role: 'admin' })
    expect(admin.match(/Marcar como pagada/g)).toHaveLength(1)
    const single = section({ ...base, role: 'admin', state: state({ active, singleAdmin: true }) })
    expect(single.match(/Marcar como pagada/g)).toHaveLength(2)
    // an archived group still lets admins mark payments, and nobody else
    expect(section({ ...base, role: 'admin', archived: true })).toContain('Marcar como pagada')
    expect(section({ ...base, role: 'member', archived: true })).not.toContain('Marcar como pagada')
  })

  it('"Terminar multa" is for admins of a live group', () => {
    expect(text(section({ role: 'admin', state: state({ active }) }))).toContain('Terminar multa')
    expect(text(section({ role: 'member', state: state({ active }) }))).not.toContain('Terminar multa')
    expect(text(section({ role: 'admin', archived: true, state: state({ active }) }))).not.toContain('Terminar multa')
  })

  it('archived: the only thing to press is the payment mark', () => {
    const h = section({ role: 'admin', archived: true, state: state({ active, proposal }) })
    const labels = [...h.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => text(m[1]))
    expect(labels.length).toBeGreaterThan(0)
    for (const l of labels) expect(l).toMatch(/^(Marcar como pagada|Desmarcar)$/)
  })

  it('the rule line stays when the fund read failed but a fine is active', () => {
    expect(text(section({ state: state({ active }), fund: null }))).toContain(RULE)
  })

  it('privacy: only names, avatars and amounts of members', () => {
    const f: GroupFund = { ...fund, people: [{ ...fund.people[0], email: 'b@secret.test', note: 'peso 70' } as never] }
    const h = section({ fund: f })
    for (const s of ['secret.test', 'peso 70']) expect(h).not.toContain(s)
  })

})

describe('fund and reject sources', () => {
  const dirs = ['src/components/groups/fund', 'src/components/groups/reject', 'src/components/debts']
  const files = dirs.flatMap((d) => (existsSync(d) ? readdirSync(d).map((f) => join(d, f)) : []))

  it('use tokens only: no arbitrary pixel values and no raw colours', () => {
    expect(files.length).toBeGreaterThan(5)
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/\[-?\d+px\]/)
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(src, f).not.toMatch(/\b(rgb|hsl|oklch)\(/)
    }
  })

  it('never use the forbidden words, in code, comments or copy', () => {
    const banned = new RegExp(['\\bapue' + 'sta', '\\bb' + 'et\\b', '\\bpo' + 'zo\\b'].join('|'), 'i')
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(banned)
  })

  it('import only contract types: no loaders, no actions module, no Supabase', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/groups-fines-(data|rpc)|groups-data|groups-rpc|fines-actions|\/supabase\//)
    }
  })
})
