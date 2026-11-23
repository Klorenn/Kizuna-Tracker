import { describe, expect, it } from 'vitest'
import { GROUP_ERROR_CODES, GROUP_GENERIC_COPY, GROUP_LOAD_COPY, GROUP_SIGN_IN_COPY, groupErrorCode, groupErrorCopy, isNotFoundCode } from '@/lib/groups-copy'

const EXPECTED: Record<string, string> = {
  group_full: 'Este grupo está completo.',
  group_limit: 'Ya estás en 10 grupos. Sal de uno para entrar a otro.',
  already_member: 'Ya eres parte de este grupo.',
  invite_not_found: 'Este enlace ya no sirve. Pide uno nuevo.',
  invite_expired: 'Este enlace ya no sirve. Pide uno nuevo.',
  habit_not_eligible: 'Ese hábito no sirve para este grupo.',
  habit_in_group: 'Ese hábito ya está en un grupo.',
  last_admin: 'Eres el único administrador. Nombra a otro antes de salir.',
  admin_limit: 'Un grupo puede tener hasta 3 administradores.',
  invite_limit: 'Ya hay 5 enlaces activos. Espera a que venza alguno.',
  not_group_admin: 'Solo un administrador puede hacer eso.',
  group_not_found: 'No encontramos ese grupo.',
  not_group_member: 'No encontramos ese grupo.',
  group_archived: 'Este grupo está archivado.',
  invalid_group: 'Revisa los datos del grupo.',
  cannot_remove_self: 'Para salir, usa «Salir del grupo».',
  too_many_attempts: 'Demasiados intentos. Prueba de nuevo en unos minutos.',
  not_authenticated: GROUP_SIGN_IN_COPY,
  commitment_change_pending: 'Ya hay un cambio de compromiso para la próxima semana. Espera a que empiece para hacer otro.',
}

import { fineErrorCopy } from '@/lib/groups-copy'

describe('commitment_change_pending', () => {
  const COPY = 'Ya hay un cambio de compromiso para la próxima semana. Espera a que empiece para hacer otro.'
  it('is mapped, also inside a longer database message', () => {
    expect(groupErrorCopy('commitment_change_pending')).toBe(COPY)
    expect(groupErrorCopy('ERROR: commitment_change_pending (P0001)')).toBe(COPY)
    expect(fineErrorCopy('commitment_change_pending')).toBe(COPY)
  })
})

describe('groupErrorCopy', () => {
  it.each(Object.entries(EXPECTED))('%s -> its Spanish copy', (code, copy) => {
    expect(groupErrorCopy(code)).toBe(copy)
    // the database raises the code inside a longer message
    expect(groupErrorCopy(`ERROR: ${code} (P0001)`)).toBe(copy)
  })

  it('covers every code the contract lists', () => {
    expect([...GROUP_ERROR_CODES].sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  it('anything else is the generic retry copy and never echoes the database message', () => {
    for (const raw of [undefined, '', 'permission denied for table groups', 'duplicate key value violates unique constraint "x"']) {
      expect(groupErrorCopy(raw)).toBe(GROUP_GENERIC_COPY)
    }
    expect(GROUP_GENERIC_COPY).toBe('No pudimos completar la acción. Inténtalo de nuevo.')
    expect(GROUP_LOAD_COPY).toMatch(/^No pudimos cargar/)
  })

  it('finds the code, and what counts as not found', () => {
    expect(groupErrorCode('boom group_not_found boom')).toBe('group_not_found')
    expect(groupErrorCode('boom')).toBeNull()
    expect(isNotFoundCode('group_not_found')).toBe(true)
    expect(isNotFoundCode('not_group_member')).toBe(true)
    expect(isNotFoundCode('group_full')).toBe(false)
  })

  it('never uses the forbidden words', () => {
    for (const c of [...Object.values(EXPECTED), GROUP_GENERIC_COPY, GROUP_LOAD_COPY]) expect(c).not.toMatch(/apuesta|bet|pozo/i)
  })
})
