import { describe, expect, it, vi } from 'vitest'
import type { GroupCommitment, GroupDraft, GroupSummary } from '@/lib/groups-contract'
import { cardLines, commitmentLine, memberCountLabel } from '@/components/groups/list/format'
import { parseInviteInput } from '@/components/groups/list/parse-invite'
import { GROUP_FORM_ERRORS, normalizeDraft, submitGroup, validateGroupDraft } from '@/components/groups/create/logic'
import { submitJoin } from '@/components/groups/join/logic'

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

describe('commitmentLine', () => {
  it('reads "<compromiso> · N por semana"', () => {
    expect(commitmentLine(commitment())).toBe('Ir al gym · 3 por semana')
  })
  it('reads "todos los días" for 7', () => {
    expect(commitmentLine(commitment({ targetPerWeek: 7 }))).toBe('Ir al gym · todos los días')
  })
  it('appends " · con foto" when a photo is required', () => {
    expect(commitmentLine(commitment({ requiresPhoto: true }))).toBe('Ir al gym · 3 por semana · con foto')
    expect(commitmentLine(commitment({ targetPerWeek: 7, requiresPhoto: true }))).toBe(
      'Ir al gym · todos los días · con foto',
    )
  })
})

describe('memberCountLabel', () => {
  it('pluralises', () => {
    expect(memberCountLabel(1)).toBe('1 miembro')
    expect(memberCountLabel(20)).toBe('20 miembros')
  })
})

describe('cardLines', () => {
  it('shows the week, my progress and the streak', () => {
    expect(cardLines(summary())).toEqual({
      week: 'Cumplen 12 de 18 esta semana',
      mine: 'Tú: 2 de 3',
      streak: 'Racha del grupo: 3 semanas',
    })
  })
  it('says "Empiezas el lunes" while I do not count yet', () => {
    expect(cardLines(summary({ myCounts: false })).mine).toBe('Empiezas el lunes')
  })
  it('singular for one week and hidden at zero', () => {
    expect(cardLines(summary({ streak: 1 })).streak).toBe('Racha del grupo: 1 semana')
    expect(cardLines(summary({ streak: 0 })).streak).toBeNull()
  })
})

describe('parseInviteInput', () => {
  const code = 'Ab3_dE-fGh1JkLmNoPqRs'
  it('takes a bare code', () => expect(parseInviteInput(`  ${code} `)).toBe(code))
  it('takes the code out of a full link, with query or slash', () => {
    expect(parseInviteInput(`https://kizuna.app/grupos/unirse/${code}`)).toBe(code)
    expect(parseInviteInput(`https://kizuna.app/grupos/unirse/${code}/?x=1#y`)).toBe(code)
    expect(parseInviteInput(`/grupos/unirse/${code}`)).toBe(code)
  })
  it('rejects anything that is not the shape of a code', () => {
    const bad = ['', '   ', 'hola', 'corto', 'https://kizuna.app/amigos', `${code}!!`, 'a b c d e f g h i j k l m n o p q', 'x'.repeat(200)]
    for (const b of bad) expect(parseInviteInput(b)).toBeNull()
  })
})

const draft = (over: Partial<GroupDraft> = {}): GroupDraft => ({
  name: 'Gym crew',
  icon: 'gym',
  color: 'cielo',
  description: '',
  commitment: commitment(),
  habit: { kind: 'create' },
  ...over,
})

describe('validateGroupDraft', () => {
  it('accepts a good draft', () => expect(validateGroupDraft(draft())).toEqual({}))
  it('name between 3 and 40, trimmed', () => {
    expect(validateGroupDraft(draft({ name: ' ab ' })).name).toBe('El nombre debe tener entre 3 y 40 letras.')
    expect(validateGroupDraft(draft({ name: 'a'.repeat(41) })).name).toBe('El nombre debe tener entre 3 y 40 letras.')
    expect(validateGroupDraft(draft({ name: 'abc' })).name).toBeUndefined()
    expect(validateGroupDraft(draft({ name: 'a'.repeat(40) })).name).toBeUndefined()
  })
  it('commitment name required and capped', () => {
    expect(validateGroupDraft(draft({ commitment: commitment({ name: '  ' }) })).commitment).toBe(
      'Escribe el compromiso del grupo.',
    )
    expect(validateGroupDraft(draft({ commitment: commitment({ name: 'a'.repeat(41) }) })).commitment).toBe(
      GROUP_FORM_ERRORS.commitmentLong,
    )
  })
  it('times per week must be an integer from 1 to 7', () => {
    for (const n of [0, 8, 2.5, Number.NaN]) {
      expect(validateGroupDraft(draft({ commitment: commitment({ targetPerWeek: n }) })).target).toBe(
        'Elige entre 1 y 7 veces por semana.',
      )
    }
    expect(validateGroupDraft(draft({ commitment: commitment({ targetPerWeek: 7 }) })).target).toBeUndefined()
  })
  it('description is capped at 140', () => {
    expect(validateGroupDraft(draft({ description: 'a'.repeat(141) })).description).toBe(GROUP_FORM_ERRORS.descriptionLong)
    expect(validateGroupDraft(draft({ description: 'a'.repeat(140) })).description).toBeUndefined()
  })
  it('an existing habit must be chosen', () => {
    expect(validateGroupDraft(draft({ habit: { kind: 'habit', habitId: '' } })).habit).toBe(GROUP_FORM_ERRORS.habit)
    expect(validateGroupDraft(draft({ habit: { kind: 'habit', habitId: 'h1' } })).habit).toBeUndefined()
  })
})

describe('normalizeDraft', () => {
  it('trims name, description and commitment name', () => {
    const n = normalizeDraft(draft({ name: '  Gym ', description: ' x ', commitment: commitment({ name: ' Ir ' }) }))
    expect([n.name, n.description, n.commitment.name]).toEqual(['Gym', 'x', 'Ir'])
  })
})

describe('submitGroup', () => {
  it('does not call the action when the draft is invalid', async () => {
    const create = vi.fn()
    const r = await submitGroup(draft({ name: 'a' }), create)
    expect(create).not.toHaveBeenCalled()
    expect(r).toEqual({ ok: false, errors: { name: 'El nombre debe tener entre 3 y 40 letras.' } })
  })
  it('sends the normalised draft and returns the id', async () => {
    const create = vi.fn().mockResolvedValue({ ok: true, data: { id: 'g9' } })
    const r = await submitGroup(draft({ name: ' Gym crew ' }), create)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Gym crew' }))
    expect(r).toEqual({ ok: true, id: 'g9' })
  })
  it('returns the server error as it came', async () => {
    const msg = 'Ya estás en 10 grupos. Sal de uno para entrar a otro.'
    const create = vi.fn().mockResolvedValue({ ok: false, error: msg })
    expect(await submitGroup(draft(), create)).toEqual({ ok: false, error: msg })
  })
  it('turns a thrown action into a retry message', async () => {
    const create = vi.fn().mockRejectedValue(new Error('boom'))
    expect(await submitGroup(draft(), create)).toEqual({ ok: false, error: GROUP_FORM_ERRORS.generic })
  })
})

describe('submitJoin', () => {
  it('passes the code and the choice', async () => {
    const join = vi.fn().mockResolvedValue({ ok: true, data: { id: 'g1' } })
    expect(await submitJoin('c', { kind: 'habit', habitId: 'h' }, join)).toEqual({ ok: true, id: 'g1' })
    expect(join).toHaveBeenCalledWith('c', { kind: 'habit', habitId: 'h' })
  })
  it('refuses an existing-habit choice without a habit', async () => {
    const join = vi.fn()
    const r = await submitJoin('c', { kind: 'habit', habitId: '' }, join)
    expect(join).not.toHaveBeenCalled()
    expect(r.ok).toBe(false)
  })
  it('returns server errors and survives a thrown action', async () => {
    const full = await submitJoin('c', { kind: 'create' }, async () => ({ ok: false, error: 'Este grupo está completo.' }))
    expect(full).toEqual({ ok: false, error: 'Este grupo está completo.' })
    const r = await submitJoin('c', { kind: 'create' }, async () => {
      throw new Error('x')
    })
    expect(r.ok).toBe(false)
  })
})
