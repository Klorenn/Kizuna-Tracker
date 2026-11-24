import { describe, expect, it } from 'vitest'
import {
  CANNOT_UNDO,
  GENERIC,
  NO_CHECKIN_TODAY,
  NOT_FOUND,
  TODAY_LOCKED,
  messageFor,
  undoMessage,
} from '@/lib/tracking-copy'

describe('tracking-copy', () => {
  it('falls back to the generic copy', () => {
    expect(messageFor(undefined)).toBe('No pudimos guardar los cambios. Inténtalo de nuevo.')
    expect(messageFor('boom')).toBe(GENERIC)
  })
  it('maps database codes to the web Spanish copy', () => {
    expect(messageFor('P0001: period_closed')).toBe('Este día ya cerró en un reto: no puedes deshacerlo.')
    expect(messageFor('photo_required')).toBe('Este hábito pide una foto de prueba.')
    expect(messageFor('habit_has_items')).toBe('Este hábito se completa marcando sus pasos.')
    expect(messageFor('item_not_found')).toBe('No encontramos ese paso.')
    expect(messageFor('checkin_today')).toBe(TODAY_LOCKED)
    expect(messageFor('not_authenticated')).toBe('Inicia sesión para continuar.')
  })
  it('picks context copy for shared codes', () => {
    expect(messageFor('habit_in_challenge', { quantityInChallenge: true })).toBe(
      'Este hábito está en un reto: puedes subir la meta, no bajarla ni cambiar la unidad.',
    )
    expect(messageFor('habit_in_challenge', { switchToQuantityInChallenge: true })).toBe(
      'Este hábito está en un reto. Cambia el tipo de registro cuando el reto termine.',
    )
    expect(messageFor('habit_in_challenge')).toBe('Este hábito tiene un reto activo. No puede ser solo tuyo.')
    expect(messageFor('photo_conflict', { logType: 'time' })).toBe('Un hábito con foto no lleva tiempo ni cantidad.')
    expect(messageFor('photo_conflict')).toBe('Un hábito con pasos pide la foto en cada paso, no en el hábito.')
  })
  it('has its own undo copy for quantity habits', () => {
    expect(undoMessage('quantity_habit')).toBe('Un hábito de cantidad se deshace quitando sumas.')
    expect(undoMessage('quantity_checkin_managed')).toBe('Un hábito de cantidad se deshace quitando sumas.')
    expect(undoMessage('period_closed')).toBe('Este día ya cerró en un reto: no puedes deshacerlo.')
    expect(undoMessage(undefined)).toBe(GENERIC)
  })
  it('exports the fixed phrases', () => {
    expect(NOT_FOUND).toBe('No encontramos ese hábito.')
    expect(CANNOT_UNDO).toBe('No puedes deshacer este registro.')
    expect(NO_CHECKIN_TODAY).toBe('Hoy no hay un registro que deshacer.')
  })
})
