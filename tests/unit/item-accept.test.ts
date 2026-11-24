import { describe, expect, it } from 'vitest'
import { CREATE_NEW } from '@/lib/challenge-accept'
import {
  acceptSelectionReady,
  initialItemSelection,
  itemRowText,
  itemSummary,
  toAcceptChoices,
  type PendingItem,
} from '@/lib/item-accept'

const habits = [
  { id: 'h1', name: 'Gimnasio', requiresPhoto: false },
  { id: 'h2', name: 'Agua', requiresPhoto: false },
  { id: 'h3', name: 'Foto diaria', requiresPhoto: true },
]
const item = (o: Partial<PendingItem> = {}): PendingItem => ({
  id: 'i1',
  theirHabit: 'Pesas',
  requiresPhoto: false,
  sourceReadable: true,
  ...o,
})

describe('initialItemSelection', () => {
  it('selects "Crear" when no habit has the proposed name', () => {
    expect(initialItemSelection([item()], habits)).toEqual({ i1: CREATE_NEW })
  })

  it('selects the same-name habit instead of offering a duplicate', () => {
    expect(initialItemSelection([item({ theirHabit: 'agua' })], habits)).toEqual({ i1: 'h2' })
  })

  it('photo items only consider photo habits', () => {
    expect(initialItemSelection([item({ theirHabit: 'Agua', requiresPhoto: true })], habits)).toEqual({ i1: CREATE_NEW })
  })

  it('unreadable source: first eligible habit or empty, never "Crear"', () => {
    expect(initialItemSelection([item({ sourceReadable: false })], habits)).toEqual({ i1: 'h1' })
    expect(initialItemSelection([item({ sourceReadable: false })], [])).toEqual({ i1: '' })
  })

  it('one entry per item', () => {
    expect(Object.keys(initialItemSelection([item(), item({ id: 'i2', theirHabit: 'Agua' })], habits))).toEqual(['i1', 'i2'])
  })
})

describe('toAcceptChoices', () => {
  it('maps "Crear" to create and a habit id to { habitId }', () => {
    expect(toAcceptChoices({ i1: CREATE_NEW, i2: 'h1' })).toEqual({ i1: 'create', i2: { habitId: 'h1' } })
  })
})

describe('acceptSelectionReady', () => {
  it('needs a choice for every item', () => {
    expect(acceptSelectionReady({ i1: 'h1', i2: '' })).toEqual({ ok: false, error: 'Elige un hábito para cada sub-reto.' })
  })
  it('refuses the same habit twice, but several "Crear" are fine', () => {
    expect(acceptSelectionReady({ i1: 'h1', i2: 'h1' })).toEqual({
      ok: false,
      error: 'Elige un hábito distinto para cada sub-reto.',
    })
    expect(acceptSelectionReady({ i1: CREATE_NEW, i2: CREATE_NEW })).toEqual({ ok: true })
  })
  it('is ok with distinct habits', () => {
    expect(acceptSelectionReady({ i1: 'h1', i2: 'h2' })).toEqual({ ok: true })
  })
})

describe('itemSummary', () => {
  it('daily and weekly, with photo', () => {
    expect(itemSummary(null, false)).toBe('Diario')
    expect(itemSummary(3, false)).toBe('3 por semana')
    expect(itemSummary(3, true)).toBe('3 por semana · Con foto')
  })
})

describe('itemRowText', () => {
  const base = { id: 'i1', myName: 'Gym', theirName: 'Pesas', target: 3, requiresPhoto: false, startsOn: null }
  it('active: both habits', () => {
    const t = itemRowText({ ...base, status: 'active', pendingFor: null }, 'Ana')
    expect(t.title).toBe('Gym · Pesas')
    expect(t.status).toBeNull()
  })
  it('active with the same name on both sides shows it once', () => {
    expect(itemRowText({ ...base, theirName: 'Gym', status: 'active', pendingFor: null }, 'Ana').title).toBe('Gym')
  })
  it('pending for me names the proposer', () => {
    const t = itemRowText({ ...base, myName: '', status: 'proposed', pendingFor: 'me' }, 'Ana')
    expect(t.title).toBe('Pesas')
    expect(t.status).toBe('Ana lo propone')
  })
  it('pending for them waits on them', () => {
    const t = itemRowText({ ...base, theirName: '', status: 'proposed', pendingFor: 'them' }, 'Ana')
    expect(t.title).toBe('Gym')
    expect(t.status).toBe('Esperando a Ana')
  })
})
