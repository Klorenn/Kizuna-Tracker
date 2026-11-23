import { describe, expect, it } from 'vitest'
import {
  CREATE_NEW,
  createSubline,
  defaultAcceptSelection,
  habitDraftFromChallenge,
  habitKindLabel,
  sameHabitName,
  type SourceHabit,
} from '@/lib/challenge-accept'
import { DEFAULT_HABIT_COLOR } from '@/domain/habit-colors'
import { LOG_TYPE_LABEL } from '@/domain/logs'

const weekly3 = { type: 'weekly', target: 3 } as const
const source = (over: Partial<SourceHabit> = {}): SourceHabit => ({
  name: 'Valorant',
  icon: 'target',
  color: 'rosa',
  logType: 'none',
  quantity: null,
  ...over,
})

describe('default selection', () => {
  it('selects "Crear" when no habit has the same name', () => {
    expect(defaultAcceptSelection('Valorant', [{ id: 'h1', name: 'Gimnasio' }])).toEqual({
      selected: CREATE_NEW,
      canCreate: true,
    })
  })
  it('selects "Crear" with no habits at all', () => {
    expect(defaultAcceptSelection('Valorant', [])).toEqual({ selected: CREATE_NEW, canCreate: true })
  })
  it.each(['  valorant ', 'VALORANT', 'Válorant', 'valorant'])(
    'selects the same-name habit for %j and hides "Crear"',
    (name) => {
      expect(defaultAcceptSelection('Valorant', [{ id: 'h1', name: 'Gimnasio' }, { id: 'h2', name }])).toEqual({
        selected: 'h2',
        canCreate: false,
      })
    },
  )
  it('compares accent-insensitively both ways', () => {
    expect(sameHabitName('Válorant', ' valorant')).toBe(true)
    expect(sameHabitName('Estudiar inglés', 'estudiar INGLES')).toBe(true)
    expect(sameHabitName('Leer', 'Leer más')).toBe(false)
  })
})

describe('"Crear" sub-line', () => {
  it('weekly 3', () => expect(createSubline(weekly3, false)).toBe('Hábito nuevo · 3 por semana'))
  it('weekly 1', () => expect(createSubline({ type: 'weekly', target: 1 }, false)).toBe('Hábito nuevo · 1 por semana'))
  it('daily', () => expect(createSubline({ type: 'daily' }, false)).toBe('Hábito nuevo · todos los días'))
  it('with photo', () => {
    expect(createSubline(weekly3, true)).toBe('Hábito nuevo · 3 por semana · con foto')
    expect(createSubline({ type: 'daily' }, true)).toBe('Hábito nuevo · todos los días · con foto')
  })
})

describe('habit copied from the proposer and the challenge', () => {
  it('copies name, icon, colour and log type; takes frequency and photo from the challenge', () => {
    const { draft, simpleFallback } = habitDraftFromChallenge(
      source({ icon: 'book', color: 'rosa', logType: 'reading' }),
      { frequency: weekly3, requiresPhoto: false },
    )
    expect(simpleFallback).toBe(false)
    expect(draft).toMatchObject({
      name: 'Valorant',
      icon: 'book',
      color: 'rosa',
      logType: 'reading',
      frequency: { type: 'weekly', target: 3 },
      requiresPhoto: false,
      visibility: 'friends',
      items: [],
      preset: null,
      quantity: null,
    })
  })
  it('the challenge wins on frequency and photo', () => {
    const { draft } = habitDraftFromChallenge(source({ logType: 'workout' }), {
      frequency: { type: 'daily' },
      requiresPhoto: true,
    })
    expect(draft.frequency).toEqual({ type: 'daily' })
    expect(draft.requiresPhoto).toBe(true)
    expect(draft.logType).toBe('workout')
  })
  it('keeps the non-personal settings of a quantity habit', () => {
    const q = { unit: 'ml', label: null, target: 2000, step: 250, display: 'glasses', glassMl: 250 } as const
    const { draft, simpleFallback } = habitDraftFromChallenge(
      source({ icon: 'drop', logType: 'quantity', quantity: { ...q } }),
      { frequency: { type: 'daily' }, requiresPhoto: false },
    )
    expect(simpleFallback).toBe(false)
    expect(draft.logType).toBe('quantity')
    expect(draft.quantity).toEqual(q)
  })
  it('falls back to "Solo marcar" when the log type cannot go with a photo', () => {
    const { draft, simpleFallback } = habitDraftFromChallenge(source({ logType: 'time' }), {
      frequency: weekly3,
      requiresPhoto: true,
    })
    expect(simpleFallback).toBe(true)
    expect(draft.logType).toBe('none')
    expect(draft.quantity).toBeNull()
    expect(draft.requiresPhoto).toBe(true)
  })
  it('falls back when the quantity settings are unusable', () => {
    const { draft, simpleFallback } = habitDraftFromChallenge(source({ logType: 'quantity', quantity: null }), {
      frequency: weekly3,
      requiresPhoto: false,
    })
    expect(simpleFallback).toBe(true)
    expect(draft.logType).toBe('none')
  })
  it('falls back when the log type is unknown', () => {
    const { simpleFallback, draft } = habitDraftFromChallenge(source({ logType: 'hack' }), {
      frequency: weekly3,
      requiresPhoto: false,
    })
    expect(simpleFallback).toBe(true)
    expect(draft.logType).toBe('none')
  })
  it('never needs the fallback for a plain habit', () => {
    expect(habitDraftFromChallenge(source(), { frequency: weekly3, requiresPhoto: true }).simpleFallback).toBe(false)
  })
  it('uses safe defaults for an unknown icon or colour', () => {
    const { draft } = habitDraftFromChallenge(source({ icon: 'nope', color: '#ff0000' }), {
      frequency: weekly3,
      requiresPhoto: false,
    })
    expect(draft.icon).toBe('target')
    expect(draft.color).toBe(DEFAULT_HABIT_COLOR)
  })
  it('copies nothing else (no steps, notes or goals)', () => {
    const { draft } = habitDraftFromChallenge(source(), { frequency: weekly3, requiresPhoto: false })
    expect(Object.keys(draft).sort()).toEqual([
      'color',
      'frequency',
      'icon',
      'items',
      'logType',
      'name',
      'preset',
      'quantity',
      'requiresPhoto',
      'visibility',
    ])
  })
})

describe('kind of record label', () => {
  it('uses the habit form labels, and "Solo marcar" for none', () => {
    expect(habitKindLabel('none')).toBe('Solo marcar')
    expect(habitKindLabel('time')).toBe(LOG_TYPE_LABEL.time)
    expect(habitKindLabel('reading')).toBe('Lectura')
    expect(habitKindLabel('quantity')).toBe(LOG_TYPE_LABEL.quantity)
  })
  it('falls back to "Solo marcar" for an unknown type', () => expect(habitKindLabel('x')).toBe('Solo marcar'))
})
