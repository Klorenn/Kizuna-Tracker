import { describe, expect, it } from 'vitest'
import { FINE_ERROR_CODES, GROUP_ERROR_CODES, GROUP_GENERIC_COPY, fineErrorCode, fineErrorCopy } from '@/lib/groups-copy'

const EXPECTED: Record<string, string> = {
  fine_pending: 'Ya hay una propuesta de multa en votación.',
  invalid_fine: 'El monto debe estar entre $1 y $100.000 y el fondo necesita un nombre.',
  fine_closed: 'Esa votación ya terminó.',
  fine_not_found: 'Esa votación ya terminó.',
  no_active_fine: 'Este grupo no tiene una multa activa.',
  already_bound: 'Ya participas en la multa.',
  not_bound: 'No participas en la multa.',
  own_debt: 'Otro administrador debe marcar tu deuda.',
  debt_not_found: 'No encontramos esa deuda.',
  no_photo_rule: 'Este grupo no pide foto.',
  own_checkin: 'No puedes rechazar tu propia foto.',
  reject_window_closed: 'Solo se puede rechazar una foto dentro de 24 horas.',
  week_closed: 'Esa semana ya cerró.',
  invalid_reason: 'Escribe un motivo de hasta 140 letras.',
  checkin_not_found: 'No encontramos ese registro.',
}

describe('fineErrorCopy', () => {
  it.each(Object.entries(EXPECTED))('%s -> its Spanish copy', (code, copy) => {
    expect(fineErrorCopy(code)).toBe(copy)
    expect(fineErrorCopy(`ERROR: ${code} (P0001)`)).toBe(copy)
    expect(fineErrorCode(`ERROR: ${code}`)).toBe(code)
  })

  it('covers exactly the codes of the fine contract, apart from the core ones', () => {
    expect([...FINE_ERROR_CODES].sort()).toEqual(Object.keys(EXPECTED).sort())
    for (const c of FINE_ERROR_CODES) expect(GROUP_ERROR_CODES).not.toContain(c)
  })

  it('falls back to the core group codes the same RPCs raise', () => {
    expect(fineErrorCopy('not_group_admin')).toBe('Solo un administrador puede hacer eso.')
    expect(fineErrorCopy('group_not_found')).toBe('No encontramos ese grupo.')
    expect(fineErrorCopy('group_archived')).toBe('Este grupo está archivado.')
    expect(fineErrorCopy('not_authenticated')).toBe('Inicia sesión para continuar.')
  })

  it('anything else is the generic retry copy and never echoes the database message', () => {
    for (const raw of [undefined, null, '', 'permission denied for table group_fines', 'duplicate key value violates unique constraint "x"']) {
      expect(fineErrorCopy(raw)).toBe(GROUP_GENERIC_COPY)
    }
    expect(fineErrorCode('boom')).toBeNull()
  })

  it('never uses the forbidden words', () => {
    for (const c of Object.values(EXPECTED)) expect(c).not.toMatch(/apuesta|\bbet\b|pozo/i)
  })
})
