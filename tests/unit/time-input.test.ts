import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/(app)/registros/time-actions', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => ({}) }))

import { MEASURE_LINK_TEXT, timeInputError } from '@/components/logs/TimeSheet'

describe('timeInputError (copy for the hours and minutes fields)', () => {
  it('is null for a valid time', () => {
    expect(timeInputError('1', '25')).toBeNull()
    expect(timeInputError('', '45')).toBeNull()
    expect(timeInputError('24', '')).toBeNull()
  })

  it('minutes over 59 say so instead of the generic range', () => {
    expect(timeInputError('', '90')).toBe('Los minutos van de 0 a 59. Para 90 min escribe 1 h 30 min.')
    expect(timeInputError('1', '75')).toBe('Los minutos van de 0 a 59. Para 75 min escribe 1 h 15 min.')
  })

  it('a decimal comma or point asks for whole numbers', () => {
    expect(timeInputError('1,5', '')).toBe('Usa números enteros: 1 h 30 min en lugar de 1,5 h.')
    expect(timeInputError('', '2.5')).toBe('Usa números enteros: 1 h 30 min en lugar de 1,5 h.')
  })

  it('letters and signs ask for digits only', () => {
    expect(timeInputError('x', '')).toBe('Escribe solo números.')
    expect(timeInputError('', '-5')).toBe('Escribe solo números.')
  })

  it('zero or more than a day keeps the range copy', () => {
    expect(timeInputError('', '')).toBe('El tiempo va de 1 minuto a 24 horas.')
    expect(timeInputError('0', '0')).toBe('El tiempo va de 1 minuto a 24 horas.')
    expect(timeInputError('25', '')).toBe('El tiempo va de 1 minuto a 24 horas.')
  })
})

describe('the sheet link to the measuring screen', () => {
  it('is named "Medir tiempo", like every other entry point (the screen opens in the last mode used)', () => {
    expect(MEASURE_LINK_TEXT).toBe('Medir tiempo')
  })
})
