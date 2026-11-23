import { describe, expect, it } from 'vitest'
import { cardioDistanceError, cardioTimeError, repeatedMessage } from '@/lib/cardio-form'

describe('cardioTimeError', () => {
  it('is null for a valid time', () => {
    expect(cardioTimeError('0', '29', '40')).toBeNull()
    expect(cardioTimeError('1', '', '')).toBeNull()
  })
  it('asks for the time when the three fields are empty', () => {
    expect(cardioTimeError('', ' ', '')).toBe('Escribe el tiempo.')
  })
  it.each([
    ['0', '60', '0'],
    ['0', '0', '75'],
    ['1', '99', '99'],
  ])('minutes or seconds above 59 (%s:%s:%s) get their own message', (h, m, s) => {
    expect(cardioTimeError(h, m, s)).toBe('Minutos y segundos van de 0 a 59.')
  })
  it('keeps the range message for zero or more than 24 hours', () => {
    expect(cardioTimeError('0', '0', '0')).toBe('El tiempo va de 1 segundo a 24 horas.')
    expect(cardioTimeError('25', '0', '0')).toBe('El tiempo va de 1 segundo a 24 horas.')
    expect(cardioTimeError('x', '0', '1')).toBe('El tiempo va de 1 segundo a 24 horas.')
  })
})

describe('cardioDistanceError', () => {
  it('is null for a valid distance', () => {
    expect(cardioDistanceError('5,2', 'run')).toBeNull()
    expect(cardioDistanceError('1500', 'swim')).toBeNull()
  })
  it('asks for the distance when empty', () => {
    expect(cardioDistanceError('  ', 'run')).toBe('Escribe la distancia.')
  })
  it('a non-integer number of metres in the pool gets its own message', () => {
    expect(cardioDistanceError('1500,5', 'swim')).toBe('Escribe los metros con números enteros.')
    expect(cardioDistanceError('abc', 'swim')).toBe('Escribe los metros con números enteros.')
  })
  it('more than three decimals of a kilometre is not an out-of-range error', () => {
    expect(cardioDistanceError('5,2345', 'run')).toBe('Usa hasta tres decimales, por ejemplo 5,2.')
    expect(cardioDistanceError('abc', 'bike')).toBe('Usa hasta tres decimales, por ejemplo 5,2.')
  })
  it('out of range keeps the 500 km message', () => {
    expect(cardioDistanceError('501', 'run')).toBe('La distancia va hasta 500 km.')
    expect(cardioDistanceError('0', 'run')).toBe('La distancia va hasta 500 km.')
  })
})

describe('repeatedMessage', () => {
  it('names what was copied', () => {
    expect(repeatedMessage({ effort: 3, note: 'Parque' })).toBe('Copiamos tu última salida, con esfuerzo y nota.')
    expect(repeatedMessage({ effort: 3, note: null })).toBe('Copiamos tu última salida, con esfuerzo.')
    expect(repeatedMessage({ effort: null, note: 'Parque' })).toBe('Copiamos tu última salida, con nota.')
    expect(repeatedMessage({ effort: null, note: null })).toBe('Copiamos tu última salida.')
  })
})
