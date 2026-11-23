import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { GroupCommitment, GroupDraft, GroupInvitePreview, GroupSummary } from '@/lib/groups-contract'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }))

const { RetosGruposSwitch } = await import('@/components/groups/RetosGruposSwitch')
const { GroupsListView } = await import('@/components/groups/list/GroupsListView')
const { JoinLinkForm } = await import('@/components/groups/list/JoinLinkForm')
const { resolveJoinLink, JOIN_LINK_ERROR } = await import('@/components/groups/list/parse-invite')
const { GroupForm, GroupFormBody } = await import('@/components/groups/create/GroupForm')
const { InvitePreviewView, InviteJoinForm } = await import('@/components/groups/join/InvitePreviewView')

const text = (h: string) => h.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, '')
const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1]
const tags = (h: string, re: RegExp) => [...h.matchAll(re)].map((m) => m[0])

const commitment = (over: Partial<GroupCommitment> = {}): GroupCommitment => ({
  name: 'Ir al gym',
  icon: 'gym',
  targetPerWeek: 3,
  requiresPhoto: false,
  ...over,
})
const summary = (over: Partial<GroupSummary> = {}): GroupSummary => ({
  id: 'g1',
  name: 'Gym crew',
  icon: 'gym',
  color: 'cielo',
  role: 'member',
  memberCount: 20,
  commitment: commitment(),
  myHabitId: 'h1',
  myDone: 2,
  myCounts: true,
  compliedCount: 12,
  countedCount: 18,
  streak: 3,
  archived: false,
  ...over,
})

describe('RetosGruposSwitch', () => {
  const html = (current: 'retos' | 'grupos') => renderToStaticMarkup(createElement(RetosGruposSwitch, { current }))
  it('is a named nav with two links, Retos and Grupos', () => {
    const h = html('retos')
    expect(h).toMatch(/<nav[^>]*aria-label="Retos y grupos"/)
    const links = tags(h, /<a [^>]*>/g)
    expect(links.map((l) => attr(l, 'href'))).toEqual(['/retos', '/grupos'])
    expect(text(h)).toBe('RetosGrupos')
  })
  it('marks only the current one with aria-current', () => {
    const [a, b] = tags(html('retos'), /<a [^>]*>/g)
    expect(a).toContain('aria-current="page"')
    expect(b).not.toContain('aria-current')
    const [c, d] = tags(html('grupos'), /<a [^>]*>/g)
    expect(c).not.toContain('aria-current')
    expect(d).toContain('aria-current="page"')
  })
  it('same box in both states (no layout shift): 44 px, equal width, the selected one differs only by colour and shadow', () => {
    const h = html('grupos')
    for (const l of tags(h, /<a [^>]*>/g)) expect(l).toMatch(/\bh-11\b[^"]*\bflex-1\b|\bflex-1\b[^"]*\bh-11\b/)
    expect(h).toContain('bg-field')
    expect(h).toContain('bg-raised')
  })
})

const hrefs = { create: '/grupos/nuevo', group: (id: string) => `/grupos/${id}`, join: (c: string) => `/grupos/unirse/${c}` }
const list = (props: { groups: GroupSummary[] | null; canCreate?: boolean }) =>
  renderToStaticMarkup(createElement(GroupsListView, { canCreate: true, hrefs, ...props }))

describe('GroupsListView', () => {
  it('failed read: LoadFailed, never the empty state', () => {
    const h = list({ groups: null })
    expect(text(h)).toContain('No pudimos cargar esto')
    expect(h).toContain('href="/grupos"')
    expect(text(h)).not.toContain('Todavía no estás')
  })

  it('empty: the binding sentence, Crear grupo and Tengo un enlace', () => {
    const h = list({ groups: [] })
    expect(text(h)).toContain('Todavía no estás en ningún grupo. Crea uno o entra con un enlace de invitación.')
    expect(h).toMatch(/<a [^>]*href="\/grupos\/nuevo"[^>]*>[\s\S]*?Crear grupo/)
    expect(h).toMatch(/<button[^>]*>[\s\S]*?Tengo un enlace/)
  })

  it('title Grupos in a heading', () => {
    expect(list({ groups: [] })).toMatch(/<h1[^>]*>Grupos<\/h1>/)
  })

  it('canCreate false: no Crear grupo, and the reason is said', () => {
    const h = list({ groups: [summary()], canCreate: false })
    expect(text(h)).not.toContain('Crear grupo')
    expect(text(h)).toContain('Ya estás en 10 grupos. Sal de uno para crear otro.')
    expect(text(h)).toContain('Tengo un enlace')
  })

  it('a card links to the group and carries the binding lines', () => {
    const h = list({ groups: [summary()] })
    expect(h).toContain('href="/grupos/g1"')
    const t = text(h)
    expect(t).toContain('Gym crew')
    expect(t).toContain('Ir al gym · 3 por semana')
    expect(t).toContain('Cumplen 12 de 18 esta semana')
    expect(t).toContain('Tú: 2 de 3')
    expect(t).toContain('Racha del grupo: 3 semanas')
  })

  it('the group colour goes through the habit colour tokens, never a hex', () => {
    const h = list({ groups: [summary()] })
    expect(h).toContain('data-habit-color="cielo"')
    expect(h).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|style=/)
  })

  it('numbers are in the mono face', () => {
    expect(list({ groups: [summary()] })).toMatch(/font-mono[^>]*>12</)
  })

  it('"Empiezas el lunes" while my week does not count; streak hidden at zero', () => {
    const t = text(list({ groups: [summary({ myCounts: false, streak: 0 })] }))
    expect(t).toContain('Empiezas el lunes')
    expect(t).not.toContain('Tú:')
    expect(t).not.toContain('Racha')
  })

  it('shows photo and every-day in the commitment', () => {
    const t = text(list({ groups: [summary({ commitment: commitment({ targetPerWeek: 7, requiresPhoto: true }) })] }))
    expect(t).toContain('Ir al gym · todos los días · con foto')
  })

  it('an unknown icon or colour never breaks the card', () => {
    const h = list({ groups: [summary({ icon: 'nope', color: 'nope' })] })
    expect(h).toContain('data-habit-color="indigo"')
  })

  it('archived groups go last, in their own muted section, without progress lines', () => {
    const h = list({ groups: [summary({ id: 'old', name: 'Viejo', archived: true }), summary({ id: 'new', name: 'Nuevo' })] })
    expect(h.indexOf('/grupos/new')).toBeLessThan(h.indexOf('Archivados'))
    expect(h.indexOf('Archivados')).toBeLessThan(h.indexOf('/grupos/old'))
    const archivedCard = h.slice(h.indexOf('/grupos/old'))
    expect(text(archivedCard)).toContain('Viejo')
    expect(text(archivedCard)).not.toContain('Cumplen')
    expect(archivedCard).toContain('text-muted')
  })

  it('no archived section when there is none', () => {
    expect(text(list({ groups: [summary()] }))).not.toContain('Archivados')
  })

  it('uses the section-label class for the headers', () => {
    expect(list({ groups: [summary({ archived: true })] })).toContain('section-label')
  })
})

describe('JoinLinkForm and resolveJoinLink', () => {
  const form = (over: Partial<Parameters<typeof JoinLinkForm>[0]> = {}) =>
    renderToStaticMarkup(createElement(JoinLinkForm, { value: '', error: null, busy: false, onChange: () => {}, onSubmit: () => {}, ...over }))

  it('has a labelled field and a submit button', () => {
    const h = form()
    expect(text(h)).toContain('Enlace o código de invitación')
    expect(h).toMatch(/<button[^>]*type="submit"/)
  })
  it('shows an error line, reserving the helper space when there is none', () => {
    expect(form({ error: JOIN_LINK_ERROR })).toContain(`role="alert"`)
    expect(text(form({ error: JOIN_LINK_ERROR }))).toContain(JOIN_LINK_ERROR)
    expect(form()).not.toContain('role="alert"')
    expect(text(form())).toContain('Pega el enlace')
  })
  it('pending: disabled and says so', () => {
    const h = form({ busy: true })
    expect(h).toMatch(/<button[^>]*disabled/)
    expect(text(h)).toContain('Abriendo…')
  })
  it('turns a pasted link into the join route, or an error', () => {
    const code = 'Ab3_dE-fGh1JkLmNoPqRs'
    expect(resolveJoinLink(`https://x.app/grupos/unirse/${code}`, hrefs.join)).toEqual({ ok: true, href: `/grupos/unirse/${code}` })
    expect(resolveJoinLink('hola', hrefs.join)).toEqual({ ok: false, error: JOIN_LINK_ERROR })
  })
})

const draft = (over: Partial<GroupDraft> = {}): GroupDraft => ({
  name: '',
  icon: 'target',
  color: 'indigo',
  description: '',
  commitment: commitment({ name: '' }),
  habit: { kind: 'create' },
  ...over,
})
const body = (over: Partial<Parameters<typeof GroupFormBody>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(GroupFormBody, {
      draft: draft(),
      habits: [],
      errors: {},
      serverError: null,
      busy: false,
      onChange: () => {},
      onSubmit: () => {},
      ...over,
    }),
  )

describe('GroupFormBody', () => {
  it('has every binding label', () => {
    const t = text(body())
    for (const s of ['Nombre del grupo', 'Descripción (opcional)', 'Compromiso', 'Veces por semana', 'Pedir foto como prueba', 'Tu hábito para este grupo', 'Crear grupo']) {
      expect(t).toContain(s)
    }
  })
  it('default choice is "Crear «<compromiso>»" and without habits there is nothing else', () => {
    const h = body({ draft: draft({ commitment: commitment({ name: 'Ir al gym' }) }) })
    expect(text(h)).toContain('Crear «Ir al gym»')
    expect(text(h)).not.toContain('Usar uno de mis hábitos')
    const radios = tags(h, /<button[^>]*role="radio"[^>]*aria-label="[^"]*"[^>]*>|<button[^>]*role="radio"[^>]*>/g)
    expect(radios.some((r) => r.includes('aria-checked="true"'))).toBe(true)
  })
  it('with habits it offers "Usar uno de mis hábitos"; choosing it lists them', () => {
    const habits = [{ id: 'h1', name: 'Correr' }, { id: 'h2', name: 'Leer' }]
    const closed = body({ habits })
    expect(text(closed)).toContain('Usar uno de mis hábitos')
    expect(text(closed)).not.toContain('Correr')
    const open = body({ habits, draft: draft({ habit: { kind: 'habit', habitId: 'h2' } }) })
    expect(text(open)).toContain('Correr')
    expect(text(open)).toContain('Leer')
  })
  it('without a pending error there is no alert, and each field reserves its helper line', () => {
    const h = body()
    expect(h).not.toContain('role="alert"')
    expect(text(h)).toContain('Entre 3 y 40 letras.')
  })
  it('field errors use the binding copy, in alerts', () => {
    const h = body({
      errors: {
        name: 'El nombre debe tener entre 3 y 40 letras.',
        commitment: 'Escribe el compromiso del grupo.',
        target: 'Elige entre 1 y 7 veces por semana.',
      },
    })
    expect(tags(h, /role="alert"/g).length).toBeGreaterThanOrEqual(3)
    const t = text(h)
    expect(t).toContain('El nombre debe tener entre 3 y 40 letras.')
    expect(t).toContain('Escribe el compromiso del grupo.')
    expect(t).toContain('Elige entre 1 y 7 veces por semana.')
  })
  it('a server error is shown as returned', () => {
    expect(text(body({ serverError: 'Revisa los datos del grupo.' }))).toContain('Revisa los datos del grupo.')
  })
  it('the server error slot is always there (reserved space)', () => {
    expect(body()).toContain('data-form-error')
  })
  it('pending: the submit is disabled and says Creando…', () => {
    const h = body({ busy: true })
    const submit = tags(h, /<button[^>]*type="submit"[^>]*>/g)[0]
    expect(submit).toContain('disabled')
    expect(text(h)).toContain('Creando…')
  })
  it('the photo toggle is a switch reflecting the draft', () => {
    const on = body({ draft: draft({ commitment: commitment({ requiresPhoto: true }) }) })
    expect(on).toMatch(/role="switch"[^>]*aria-checked="true"/)
    expect(body()).toMatch(/role="switch"[^>]*aria-checked="false"/)
  })
  it('steppers are 44 px targets and tokens only', () => {
    const h = body()
    expect(h).toMatch(/aria-label="Menos: Veces por semana"[^>]*>|class="[^"]*size-11[^"]*"[^>]*aria-label="Menos: Veces por semana"/)
    expect(h).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|style=/)
  })
  it('the stepper disables at the limits', () => {
    const max = body({ draft: draft({ commitment: commitment({ targetPerWeek: 7 }) }) })
    expect(tags(max, /<button[^>]*aria-label="Más: Veces por semana"[^>]*>/g)[0]).toContain('disabled')
    const min = body({ draft: draft({ commitment: commitment({ targetPerWeek: 1 }) }) })
    expect(tags(min, /<button[^>]*aria-label="Menos: Veces por semana"[^>]*>/g)[0]).toContain('disabled')
  })
})

describe('GroupForm', () => {
  it('renders empty with no errors and the default choice', () => {
    const h = renderToStaticMarkup(
      createElement(GroupForm, { habits: [], actions: { create: async () => ({ ok: true as const, data: { id: 'g' } }) }, onCreated: () => {} }),
    )
    expect(h).not.toContain('role="alert"')
    expect(text(h)).toContain('Crear grupo')
    expect(text(h)).toContain('Crear «')
  })
})

const preview = (over: Partial<GroupInvitePreview> = {}): GroupInvitePreview => ({
  name: 'Gym crew',
  icon: 'gym',
  color: 'cielo',
  commitment: commitment(),
  memberCount: 20,
  full: false,
  ...over,
})
const invite = (over: Partial<Parameters<typeof InvitePreviewView>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(InvitePreviewView, {
      preview: preview(),
      signedIn: true,
      loginHref: '/login?next=%2Fgrupos%2Funirse%2Fabc',
      habits: [],
      code: 'abc',
      actions: { join: async () => ({ ok: true as const, data: { id: 'g1' } }) },
      onJoined: () => {},
      ...over,
    }),
  )
const CONSENT = 'Los miembros verán tus registros y fotos de este hábito.'

describe('InvitePreviewView', () => {
  it('invalid link', () => {
    const h = invite({ preview: null })
    expect(text(h)).toContain('Este enlace ya no sirve. Pide uno nuevo.')
    expect(text(h)).not.toContain('Unirme')
    expect(text(h)).not.toContain(CONSENT)
  })

  it('signed in: header, commitment, members, consent before the button, button Unirme', () => {
    const h = invite()
    const t = text(h)
    expect(t).toContain('Te invitaron a Gym crew')
    expect(t).toContain('Ir al gym · 3 por semana')
    expect(t).toContain('20 miembros')
    expect(t).toContain(CONSENT)
    expect(t).toContain('Unirme')
    expect(t.indexOf(CONSENT)).toBeLessThan(t.indexOf('Unirme'))
    expect(h).toMatch(/font-mono[^>]*>20</)
  })

  it('signed in: the habit choice with Crear «compromiso»', () => {
    expect(text(invite())).toContain('Crear «Ir al gym»')
    expect(text(invite())).toContain('Tu hábito para este grupo')
  })

  it('signed in with habits: offers the own-habit option', () => {
    expect(text(invite({ habits: [{ id: 'h1', name: 'Correr' }] }))).toContain('Usar uno de mis hábitos')
  })

  it('signed out: consent, then a link to login; no join button', () => {
    const h = invite({ signedIn: false })
    const t = text(h)
    expect(t).toContain(CONSENT)
    expect(t).toContain('Inicia sesión para unirte')
    expect(t).not.toContain('Unirme')
    expect(h).toContain('href="/login?next=%2Fgrupos%2Funirse%2Fabc"')
    expect(t.indexOf(CONSENT)).toBeLessThan(t.indexOf('Inicia sesión para unirte'))
    expect(t).not.toContain('Tu hábito para este grupo')
  })

  it('full: says so, no join button, no consent, no login button', () => {
    for (const signedIn of [true, false]) {
      const t = text(invite({ preview: preview({ full: true }), signedIn }))
      expect(t).toContain('Este grupo está completo.')
      expect(t).not.toContain('Unirme')
      expect(t).not.toContain('Inicia sesión')
      expect(t).not.toContain(CONSENT)
    }
  })

  it('already a member: a link to the group, no join button', () => {
    const h = invite({ alreadyMember: true, groupHref: '/grupos/g1' })
    expect(text(h)).toContain('Ya eres parte de este grupo.')
    expect(h).toContain('href="/grupos/g1"')
    expect(text(h)).not.toContain('Unirme')
    expect(text(h)).not.toContain(CONSENT)
  })

  it('already a member without a known group id links to the list', () => {
    expect(invite({ alreadyMember: true })).toContain('href="/grupos"')
  })

  it('never shows member names, only counts; group colour through tokens', () => {
    const h = invite()
    expect(h).toContain('data-habit-color="cielo"')
    expect(h).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|style=/)
  })

  it('a singular member count', () => {
    expect(text(invite({ preview: preview({ memberCount: 1 }) }))).toContain('1 miembro')
  })
})

describe('InviteJoinForm', () => {
  const form = (over: Partial<Parameters<typeof InviteJoinForm>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(InviteJoinForm, {
        commitmentName: 'Ir al gym',
        habits: [],
        choice: { kind: 'create' },
        onChoice: () => {},
        busy: false,
        error: null,
        onSubmit: () => {},
        ...over,
      }),
    )
  it('pending: disabled, Uniéndote…', () => {
    const h = form({ busy: true })
    expect(tags(h, /<button[^>]*type="submit"[^>]*>/g)[0]).toContain('disabled')
    expect(text(h)).toContain('Uniéndote…')
  })
  it('shows the server error and always reserves its slot', () => {
    expect(text(form({ error: 'Este grupo está completo.' }))).toContain('Este grupo está completo.')
    expect(form()).toContain('data-form-error')
  })
})
