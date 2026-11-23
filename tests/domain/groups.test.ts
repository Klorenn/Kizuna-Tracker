import { describe, expect, it } from 'vitest'
import {
  commitmentLine,
  compliedLabel,
  dateLabel,
  formatInviteCode,
  inviteUrlPath,
  isInviteCodeShape,
  normalizeInviteCode,
  isLocalDate,
  isUuid,
  myProgressLabel,
  pendingCommitmentLabel,
  streakLabel,
  validateGroupDraft,
  validateGroupFields,
  validateCommitment,
  weekLabel,
  weekCompliedLabel,
} from '@/domain/groups'
import type { GroupDraft } from '@/lib/groups-contract'

const HABIT = '11111111-1111-4111-8111-111111111111'
const draft = (over: Partial<GroupDraft> = {}): GroupDraft => ({
  name: 'Gym de los lunes',
  icon: 'barbell',
  color: 'indigo',
  description: '',
  commitment: { name: 'Ir al gym', icon: 'barbell', targetPerWeek: 3, requiresPhoto: false },
  habit: { kind: 'create' },
  ...over,
})
const commit = (over: Record<string, unknown> = {}) => ({ name: 'Gym', icon: 'barbell', targetPerWeek: 3, requiresPhoto: false, ...over })
const REVIEW = { ok: false, error: 'Revisa los datos del grupo.' }

describe('isUuid', () => {
  it('accepts a uuid and refuses everything else', () => {
    expect(isUuid(HABIT)).toBe(true)
    for (const v of ['', 'x', 42, null, undefined, `${HABIT}0`, "' or 1=1 --"]) expect(isUuid(v)).toBe(false)
  })
})

describe('validateGroupDraft', () => {
  it('accepts a valid draft and trims text', () => {
    const r = validateGroupDraft(
      draft({ name: '  Gym  ', description: ' hola ', commitment: commit({ name: ' Gym ', targetPerWeek: 7, requiresPhoto: true }) }),
    )
    expect(r).toEqual({
      ok: true,
      draft: draft({ name: 'Gym', description: 'hola', commitment: commit({ targetPerWeek: 7, requiresPhoto: true }) }),
    })
  })
  it('name must have 3 to 40 letters', () => {
    for (const name of ['', '  ', 'ab', ' ab ', 'x'.repeat(41)]) {
      expect(validateGroupDraft(draft({ name }))).toEqual({ ok: false, error: 'El nombre debe tener entre 3 y 40 letras.' })
    }
    expect(validateGroupDraft(draft({ name: 'abc' })).ok).toBe(true)
    expect(validateGroupDraft(draft({ name: 'x'.repeat(40) })).ok).toBe(true)
  })
  it('non-string name is refused, not thrown', () => {
    expect(validateGroupDraft(draft({ name: 5 as unknown as string }))).toEqual({ ok: false, error: 'El nombre debe tener entre 3 y 40 letras.' })
  })
  it('description is at most 140', () => {
    expect(validateGroupDraft(draft({ description: 'x'.repeat(140) })).ok).toBe(true)
    expect(validateGroupDraft(draft({ description: 'x'.repeat(141) }))).toEqual({
      ok: false,
      error: 'La descripción puede tener hasta 140 letras.',
    })
  })
  it('commitment name is required and at most 40', () => {
    expect(validateGroupDraft(draft({ commitment: commit({ name: '  ' }) }))).toEqual({ ok: false, error: 'Escribe el compromiso del grupo.' })
    expect(validateGroupDraft(draft({ commitment: commit({ name: 'x'.repeat(41) }) }))).toEqual({
      ok: false,
      error: 'El compromiso puede tener hasta 40 letras.',
    })
    expect(validateGroupDraft(draft({ commitment: commit({ name: 'x'.repeat(40) }) })).ok).toBe(true)
  })
  it('target is an integer from 1 to 7', () => {
    for (const targetPerWeek of [0, 8, -1, 2.5, NaN, Infinity, '3']) {
      expect(validateGroupDraft(draft({ commitment: commit({ targetPerWeek }) as never }))).toEqual({
        ok: false,
        error: 'Elige entre 1 y 7 veces por semana.',
      })
    }
    for (const targetPerWeek of [1, 7]) expect(validateGroupDraft(draft({ commitment: commit({ targetPerWeek }) })).ok).toBe(true)
  })
  it('requiresPhoto must be a boolean', () => {
    expect(validateGroupDraft(draft({ commitment: commit({ requiresPhoto: 'yes' }) as never }))).toEqual(REVIEW)
  })
  it('icons and colour must be known keys', () => {
    expect(validateGroupDraft(draft({ icon: 'nope' }))).toEqual(REVIEW)
    expect(validateGroupDraft(draft({ color: '#fff' }))).toEqual(REVIEW)
    expect(validateGroupDraft(draft({ commitment: commit({ icon: 'nope' }) }))).toEqual(REVIEW)
  })
  it('habit choice: create, or a habit with a uuid', () => {
    expect(validateGroupDraft(draft({ habit: { kind: 'habit', habitId: HABIT } })).ok).toBe(true)
    expect(validateGroupDraft(draft({ habit: { kind: 'habit', habitId: 'nope' } }))).toEqual(REVIEW)
    expect(validateGroupDraft(draft({ habit: { kind: 'other' } as never }))).toEqual(REVIEW)
    expect(validateGroupDraft(null as never)).toEqual(REVIEW)
  })
})

describe('validateGroupFields and validateCommitment', () => {
  it('fields share the name, description, icon and colour rules', () => {
    expect(validateGroupFields({ name: 'ab', icon: 'barbell', color: 'indigo', description: '' }).ok).toBe(false)
    expect(validateGroupFields({ name: ' Gym ', icon: 'barbell', color: 'indigo', description: ' x ' })).toEqual({
      ok: true,
      fields: { name: 'Gym', icon: 'barbell', color: 'indigo', description: 'x' },
    })
  })
  it('commitment shares the target rule', () => {
    expect(validateCommitment(commit({ targetPerWeek: 9 }))).toEqual({ ok: false, error: 'Elige entre 1 y 7 veces por semana.' })
  })
})

describe('isLocalDate and isInviteCodeShape', () => {
  it('accepts only real dates', () => {
    expect(isLocalDate('2026-11-23')).toBe(true)
    expect(isLocalDate('2028-02-29')).toBe(true)
    for (const v of ['2026-02-30', '2026-13-01', '2026-1-1', '', 'hoy', 5, null]) expect(isLocalDate(v)).toBe(false)
  })
  it('invitation codes: exactly 8 characters of the alphabet, canonical upper case', () => {
    expect(isInviteCodeShape('K7QM4PXD')).toBe(true)
    for (const v of ['k7qm4pxd', 'K7QM-4PXD', 'K7QM4PX', 'K7QM4PXDD', 'K7QM4PX0', 'K7QM4PX1', 'K7QM4PXI', 'K7QM4PXO', ' K7QM4PXD', '', null, 7]) expect(isInviteCodeShape(v)).toBe(false)
  })
})

describe('invitation code helpers', () => {
  it('normalise: any case, optional hyphen after the fourth, spaces ignored', () => {
    for (const v of ['K7QM\t4PXD', 'K7QM\n4PXD', 'K7QM4PXD', 'k7qm4pxd', 'K7QM-4PXD', 'k7qm-4pxd', ' K7QM 4PXD ', 'k7qm 4pxd']) expect(normalizeInviteCode(v)).toBe('K7QM4PXD')
  })
  it('normalise: the same rule as the database (one hyphen anywhere, then 8 ASCII alphabet characters, checked before upper-casing)', () => {
    expect(normalizeInviteCode('K7Q-M4PXD')).toBe('K7QM4PXD')
    expect(normalizeInviteCode('\u{FB00}'.repeat(4))).toBeNull()
    expect(normalizeInviteCode('x'.repeat(65))).toBeNull()
  })
  it.each([['NBSP', '\u00A0'], ['U+202F', '\u202F'], ['U+2007', '\u2007'], ['U+FEFF', '\uFEFF']])(
    'normalise: %s inside a code is not whitespace (the database strips ASCII whitespace only)',
    (_n, ch) => {
      expect(normalizeInviteCode(`K7QM${ch}4PXD`)).toBeNull()
      expect(normalizeInviteCode(`${ch}K7QM4PXD`)).toBeNull()
    },
  )
  it('normalise: strips exactly the ASCII whitespace (space, tab, LF, VT, FF, CR)', () => {
    expect(normalizeInviteCode('K7QM \t\n\v\f\r4PXD')).toBe('K7QM4PXD')
  })
  it('normalise: 64 characters is the longest accepted input, 65 is refused', () => {
    expect(normalizeInviteCode('K7QM4PXD' + ' '.repeat(56))).toBe('K7QM4PXD')
    expect(normalizeInviteCode('K7QM4PXD' + ' '.repeat(57))).toBeNull()
  })
  it('normalise: refuses everything else', () => {
    for (const v of ['K7QM--4PXD', 'K7QM-4PX-D', 'K7QM4PX', 'K7QM4PXDD', 'K7QM-4PXDD', 'K7QM4PX0', 'K7QM4PX1', 'K7QMIPXD', 'K7QMOPXD', 'K7QM_4PXD', 'ﬀ7QM4PXD', 'ſ7QM4PXD', 'Ｋ7QM4PXD', 'K7QM4PXD'.padEnd(65, ' ') + 'x', '../K7QM4PXD', 'K7QM%2D4PXD', '', null, undefined, 7]) expect(normalizeInviteCode(v)).toBeNull()
  })
  it('display form and url', () => {
    expect(formatInviteCode('K7QM4PXD')).toBe('K7QM-4PXD')
    expect(inviteUrlPath('K7QM4PXD')).toBe('/g/K7QM4PXD')
  })
})

describe('labels', () => {
  it('commitment line', () => {
    expect(commitmentLine(commit())).toBe('Gym · 3 por semana')
    expect(commitmentLine(commit({ targetPerWeek: 7 }))).toBe('Gym · todos los días')
    expect(commitmentLine(commit({ targetPerWeek: 1, requiresPhoto: true }))).toBe('Gym · 1 por semana · con foto')
  })
  it('cumplen / cumplieron', () => {
    expect(compliedLabel(3, 10)).toBe('Cumplen 3 de 10 esta semana')
    expect(weekCompliedLabel(2, 5)).toBe('Cumplieron 2 de 5')
  })
  it('my progress', () => {
    expect(myProgressLabel(true, 2, 3)).toBe('Tú: 2 de 3')
    expect(myProgressLabel(false, 0, 3)).toBe('Empiezas el lunes')
  })
  it('streak: hidden at 0, singular at 1', () => {
    expect(streakLabel(0)).toBeNull()
    expect(streakLabel(-1)).toBeNull()
    expect(streakLabel(1)).toBe('Racha del grupo: 1 semana')
    expect(streakLabel(4)).toBe('Racha del grupo: 4 semanas')
  })
  it('dates and weeks', () => {
    expect(dateLabel('2026-11-30')).toBe('30 de noviembre')
    expect(dateLabel('2026-01-05')).toBe('5 de enero')
    expect(weekLabel('2026-11-23')).toBe('Semana del 23 de noviembre')
    expect(dateLabel('garbage')).toBe('garbage')
  })
  it('pending commitment', () => {
    expect(pendingCommitmentLabel({ ...commit({ name: 'Correr', targetPerWeek: 4 }), effectiveFrom: '2026-11-30' })).toBe(
      'Desde el lunes 30 de noviembre: Correr · 4 por semana',
    )
  })
})
