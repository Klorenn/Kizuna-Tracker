import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HABIT_COLOR,
  HABIT_COLORS,
  HABIT_COLOR_LABEL,
  PRESET_COLOR,
  habitColorVar,
  isHabitColor,
  toHabitColor,
} from '@/domain/habit-colors'
import { PRESET_KEYS, customDraft, presetDraft, validateHabitDraft } from '@/domain/presets'

describe('habit colors', () => {
  it('has the 8 curated keys, stored as token names', () => {
    expect(HABIT_COLORS).toEqual(['salvia', 'durazno', 'lavanda', 'arena', 'cielo', 'rosa', 'oliva', 'indigo'])
    expect(DEFAULT_HABIT_COLOR).toBe('indigo')
  })

  it('labels every color in Spanish', () => {
    expect(HABIT_COLOR_LABEL).toEqual({
      salvia: 'Salvia',
      durazno: 'Durazno',
      lavanda: 'Lavanda',
      arena: 'Arena',
      cielo: 'Cielo',
      rosa: 'Rosa',
      oliva: 'Oliva',
      indigo: 'Índigo',
    })
  })

  it('validates keys strictly (no hex, no case folding)', () => {
    expect(isHabitColor('salvia')).toBe(true)
    expect(isHabitColor('Salvia')).toBe(false)
    expect(isHabitColor('#5A5AC2')).toBe(false)
    expect(isHabitColor('índigo')).toBe(false)
    expect(isHabitColor(undefined)).toBe(false)
    expect(isHabitColor(3)).toBe(false)
  })

  it('falls back to indigo for unknown values read from the db or an rpc', () => {
    expect(toHabitColor('cielo')).toBe('cielo')
    expect(toHabitColor('neon')).toBe('indigo')
    expect(toHabitColor(null)).toBe('indigo')
  })

  it('points at CSS variables only', () => {
    expect(habitColorVar('rosa')).toBe('var(--habit-rosa)')
    expect(habitColorVar('rosa', 'soft')).toBe('var(--habit-rosa-soft)')
  })

  it('maps every preset to a default color', () => {
    expect(PRESET_COLOR).toEqual({
      gym: 'durazno',
      water: 'cielo',
      study: 'lavanda',
      read: 'arena',
      walk: 'salvia',
      sleep: 'indigo',
      eat_well: 'oliva',
      watch: 'rosa',
      run: 'durazno',
    })
    for (const key of PRESET_KEYS) expect(presetDraft(key).color).toBe(PRESET_COLOR[key])
  })

  it('a custom habit starts in indigo', () => {
    expect(customDraft().color).toBe('indigo')
  })

  it('validateHabitDraft rejects an unknown color', () => {
    const draft = { ...customDraft(), name: 'Yoga', color: 'neon' as never }
    expect(validateHabitDraft(draft)).toEqual({ ok: false, error: 'Elige un color.' })
    expect(validateHabitDraft({ ...customDraft(), name: 'Yoga', color: 'oliva' })).toEqual({ ok: true })
  })
})
