import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  CommitmentForm,
  ConfirmBody,
  EditGroupForm,
  InviteView,
  MemberMenuBody,
  prepareCommitment,
  prepareEdit,
  stepTarget,
} from '@/components/groups/detail/AdminSheets'

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const noop = () => {}
const person = (role: 'admin' | 'member') => ({
  userId: 'u-beto',
  username: 'beto',
  displayName: 'Beto',
  avatarPath: null,
  avatarPreset: null,
  role,
  joinedOn: '2026-11-02',
  counts: true,
  done: 1,
  target: 3,
})

describe('InviteView', () => {
  const view = (p: Partial<Parameters<typeof InviteView>[0]>) =>
    renderToStaticMarkup(createElement(InviteView, { state: { status: 'pending' }, copy: 'idle', onRetry: noop, onCopy: noop, ...p }))

  it('pending: says it is creating the link and offers nothing to copy yet', () => {
    const h = view({})
    expect(h).toContain('aria-busy="true"')
    expect(text(h)).toContain('Creando enlace…')
    expect(text(h)).not.toContain('Copiar enlace')
  })

  it('ready: the link in a selectable read-only field and "Copiar enlace"', () => {
    const h = view({ state: { status: 'ready', url: 'https://kizuna.test/g/K7QM4PXD', code: 'K7QM4PXD' } })
    expect(h).toContain('value="https://kizuna.test/g/K7QM4PXD"')
    expect(h).toContain('readOnly')
    expect(text(h)).toContain('Copiar enlace')
    expect(text(h)).toContain('7 días')
  })

  it('ready: the code in display form (two groups of four), selectable, with "Copiar código" next to "Copiar enlace"', () => {
    const h = view({ state: { status: 'ready', url: 'https://kizuna.test/g/K7QM4PXD', code: 'K7QM4PXD' } })
    expect(h).toContain('value="K7QM-4PXD"')
    expect(text(h)).toContain('Código de invitación')
    expect(text(h)).toContain('Copiar código')
    expect(text(h)).toContain('Copiar enlace')
  })

  it('code copied: that button reads "Código copiado", the link button stays as it was', () => {
    const h = view({ state: { status: 'ready', url: 'https://k.test/x', code: 'K7QM4PXD' }, copy: 'copied', copied: 'code' })
    expect(text(h)).toContain('Código copiado')
    expect(text(h)).toContain('Copiar enlace')
    expect(text(h)).not.toContain('Enlace copiado')
  })

  it('copied: the button reads "Enlace copiado" and announces it politely', () => {
    const h = view({ state: { status: 'ready', url: 'https://k.test/x', code: 'K7QM4PXD' }, copy: 'copied' })
    expect(text(h)).toContain('Enlace copiado')
    expect(text(h)).not.toContain('Copiar enlace')
    expect(h).toContain('aria-live="polite"')
  })

  it('clipboard unavailable: the link stays selectable and the sheet says how to copy it', () => {
    const h = view({ state: { status: 'ready', url: 'https://k.test/x', code: 'K7QM4PXD' }, copy: 'unavailable' })
    expect(h).toContain('value="https://k.test/x"')
    expect(h).toContain('role="alert"')
    expect(text(h)).toContain('No pudimos copiar el enlace')
  })

  it('error (for example invite_limit): the server copy where it happened, and a retry', () => {
    const h = view({ state: { status: 'error', error: 'Ya hay 5 enlaces activos. Espera a que venza alguno.' } })
    expect(text(h)).toContain('Ya hay 5 enlaces activos. Espera a que venza alguno.')
    expect(text(h)).toContain('Reintentar')
  })
})

describe('EditGroupForm', () => {
  const initial = { name: 'Gym del sur', icon: 'barbell', color: 'salvia', description: 'Los martes y jueves' }
  const form = (p: Partial<Parameters<typeof EditGroupForm>[0]> = {}) =>
    renderToStaticMarkup(createElement(EditGroupForm, { initial, pending: false, error: null, onSubmit: noop, ...p }))

  it('shows the current values, the icon and colour pickers and "Guardar"', () => {
    const h = form()
    expect(h).toContain('value="Gym del sur"')
    expect(h).toContain('value="Los martes y jueves"')
    expect(h).toContain('aria-label="Ícono"')
    expect(h).toContain('aria-labelledby="habit-color-label"')
    expect(text(h)).toContain('Nombre del grupo')
    expect(text(h)).toContain('Descripción (opcional)')
    expect(text(h)).toContain('Guardar')
  })

  it('pending: fields and button are disabled and the label says what is happening', () => {
    const h = form({ pending: true })
    expect(text(h)).toContain('Guardando…')
    expect(h.match(/disabled=""/g)!.length).toBeGreaterThanOrEqual(3)
  })

  it('shows the error of the action in the form', () => {
    expect(text(form({ error: 'Solo un administrador puede hacer eso.' }))).toContain('Solo un administrador puede hacer eso.')
  })

  it('prepareEdit trims, or answers with the binding validation copy', () => {
    expect(prepareEdit({ ...initial, name: '  Gym  ', description: ' hola ' })).toEqual({
      ok: true,
      fields: { ...initial, name: 'Gym', description: 'hola' },
    })
    expect(prepareEdit({ ...initial, name: 'ab' })).toEqual({ ok: false, error: 'El nombre debe tener entre 3 y 40 letras.' })
  })
})

describe('CommitmentForm', () => {
  const initial = { name: 'Gimnasio', icon: 'barbell', targetPerWeek: 3, requiresPhoto: false }
  const form = (p: Partial<Parameters<typeof CommitmentForm>[0]> = {}) =>
    renderToStaticMarkup(createElement(CommitmentForm, { initial, pending: false, error: null, onSubmit: noop, ...p }))

  it('explains that it applies from next Monday and offers the photo switch', () => {
    const h = form()
    expect(text(h)).toContain('Se aplica desde el próximo lunes')
    expect(h).toContain('role="switch"')
    expect(text(h)).toContain('Pedir foto como prueba')
    expect(text(h)).toContain('Veces por semana')
    expect(text(h)).toContain('Cambiar compromiso')
  })

  it('the target is a stepper, one control per 44 px, never seven cells that overflow 360 px', () => {
    const h = form()
    expect(h).toContain('aria-label="Una vez menos por semana"')
    expect(h).toContain('aria-label="Una vez más por semana"')
    expect(h).toMatch(/font-mono[^>]*>3<\/span>/)
  })

  it('seven reads "todos los días"', () => {
    expect(text(form({ initial: { ...initial, targetPerWeek: 7 } }))).toContain('todos los días')
  })

  it('pending and error states', () => {
    expect(text(form({ pending: true }))).toContain('Guardando…')
    expect(text(form({ error: 'Este grupo está archivado.' }))).toContain('Este grupo está archivado.')
  })

  it('stepTarget clamps to 1..7; prepareCommitment validates', () => {
    expect(stepTarget(7, 1)).toBe(7)
    expect(stepTarget(1, -1)).toBe(1)
    expect(stepTarget(3, 1)).toBe(4)
    expect(prepareCommitment({ ...initial, name: ' Correr ' })).toEqual({ ok: true, commitment: { ...initial, name: 'Correr' } })
    expect(prepareCommitment({ ...initial, name: '' })).toEqual({ ok: false, error: 'Escribe el compromiso del grupo.' })
  })
})

describe('ConfirmBody', () => {
  const body = (p: Partial<Parameters<typeof ConfirmBody>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(ConfirmBody, {
        message: '¿Salir de Gym del sur? Tu hábito sigue siendo tuyo.',
        confirmLabel: 'Salir del grupo',
        pendingLabel: 'Saliendo…',
        pending: false,
        error: null,
        onConfirm: noop,
        onCancel: noop,
        ...p,
      }),
    )
  it('the binding message, a destructive confirm and a way back', () => {
    const h = body()
    expect(text(h)).toContain('¿Salir de Gym del sur? Tu hábito sigue siendo tuyo.')
    expect(text(h)).toContain('Salir del grupo')
    expect(text(h)).toContain('Cancelar')
    expect(h).toContain('text-alert-text')
  })
  it('pending: both buttons disabled so it cannot be sent twice', () => {
    const h = body({ pending: true })
    expect(h.match(/disabled=""/g)).toHaveLength(2)
    expect(text(h)).toContain('Saliendo…')
  })
  it('shows the server error where the action was taken (last_admin)', () => {
    const h = body({ error: 'Eres el único administrador. Nombra a otro antes de salir.' })
    expect(h).toContain('role="alert"')
    expect(text(h)).toContain('Eres el único administrador. Nombra a otro antes de salir.')
  })
})

describe('MemberMenuBody', () => {
  const body = (p: Partial<Parameters<typeof MemberMenuBody>[0]>) =>
    renderToStaticMarkup(
      createElement(MemberMenuBody, {
        member: person('member'),
        step: 'menu',
        pending: false,
        error: null,
        onToggleAdmin: noop,
        onAskRemove: noop,
        onConfirmRemove: noop,
        onBack: noop,
        ...p,
      }),
    )
  it('a member can be made administrator', () => {
    const h = text(body({}))
    expect(h).toContain('Hacer administrador')
    expect(h).not.toContain('Quitar administrador')
    expect(h).toContain('Sacar del grupo')
  })
  it('an administrator can lose the role', () => {
    const h = text(body({ member: person('admin') }))
    expect(h).toContain('Quitar administrador')
    expect(h).not.toContain('Hacer administrador')
  })
  it('removing asks first, in the same sheet, naming the person', () => {
    const h = text(body({ step: 'confirm' }))
    expect(h).toContain('¿Sacar a Beto del grupo? Su hábito sigue siendo suyo.')
    expect(h).toContain('Cancelar')
  })
  it('admin_limit shows where the role was changed', () => {
    expect(text(body({ error: 'Un grupo puede tener hasta 3 administradores.' }))).toContain('Un grupo puede tener hasta 3 administradores.')
  })
  it('pending disables every action', () => {
    expect(body({ pending: true }).match(/disabled=""/g)!.length).toBeGreaterThanOrEqual(2)
  })
  it('does not call anything on render', () => {
    const fn = vi.fn()
    body({ onToggleAdmin: fn, onAskRemove: fn, onConfirmRemove: fn })
    expect(fn).not.toHaveBeenCalled()
  })
})
