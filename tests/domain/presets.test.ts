import { describe, expect, it } from 'vitest'
import {
  HABIT_ICONS,
  PRESETS,
  customDraft,
  normalizeHabitDraft,
  dayComplete,
  presetDraft,
  validateHabitDraft,
} from '@/domain/presets'

describe('presets', () => {
  it('ships the predefined habits', () => {
    expect(PRESETS.eat_well.items.map((i) => i.label)).toEqual(['Desayuno', 'Almuerzo', 'Once', 'Cena'])
    expect(PRESETS.gym).toMatchObject({
      name: 'Gimnasio',
      icon: 'barbell',
      requiresPhoto: true,
      frequency: { type: 'weekly', target: 4 },
    })
    expect(PRESETS.study.frequency).toEqual({ type: 'weekly', target: 5 })
    expect(PRESETS.sleep.name).toBe('Dormir 8 h')
    expect(Object.values(PRESETS).every((p) => p.visibility === 'friends')).toBe(true)
  })

  it('presetDraft returns a deep copy', () => {
    const d = presetDraft('eat_well')
    d.items.pop()
    expect(PRESETS.eat_well.items).toHaveLength(4)
    expect(d.preset).toBe('eat_well')
  })

  it('has 26 unique icons, laptop and desk for study habits', () => {
    expect(HABIT_ICONS).toHaveLength(26)
    expect(new Set(HABIT_ICONS).size).toBe(26)
    expect(HABIT_ICONS).toContain('laptop')
    expect(HABIT_ICONS).toContain('desk')
  })
})

describe('validateHabitDraft', () => {
  const item = (label: string) => ({ label, requiresPhoto: false })
  it('rejects a blank name', () => {
    expect(validateHabitDraft({ ...customDraft(), name: ' ' }).ok).toBe(false)
  })
  it('rejects photo at habit level when there are items', () => {
    expect(validateHabitDraft({ ...presetDraft('eat_well'), requiresPhoto: true })).toEqual({
      ok: false,
      error: 'Un hábito con pasos pide la foto en cada paso, no en el hábito.',
    })
  })
  it('rejects weekly target out of range', () => {
    expect(
      validateHabitDraft({ ...customDraft(), name: 'Yoga', frequency: { type: 'weekly', target: 0 } }).ok,
    ).toBe(false)
    expect(
      validateHabitDraft({ ...customDraft(), name: 'Yoga', frequency: { type: 'weekly', target: 8 } }).ok,
    ).toBe(false)
  })
  it('rejects more than 12 items', () => {
    const items = Array.from({ length: 13 }, (_, i) => item(`P${i}`))
    expect(validateHabitDraft({ ...customDraft(), name: 'X', items }).ok).toBe(false)
  })
  it('rejects duplicated item labels ignoring case', () => {
    expect(
      validateHabitDraft({ ...customDraft(), name: 'X', items: [item('A'), item('a')] }).ok,
    ).toBe(false)
  })
  it('rejects blank or long item labels and long names', () => {
    expect(validateHabitDraft({ ...customDraft(), name: 'X', items: [item(' ')] }).ok).toBe(false)
    expect(validateHabitDraft({ ...customDraft(), name: 'X', items: [item('a'.repeat(41))] }).ok).toBe(false)
    expect(validateHabitDraft({ ...customDraft(), name: 'a'.repeat(61) }).ok).toBe(false)
  })
  it('accepts valid drafts', () => {
    expect(validateHabitDraft(presetDraft('eat_well'))).toEqual({ ok: true })
    expect(validateHabitDraft({ ...customDraft(), name: 'Yoga' })).toEqual({ ok: true })
  })
})

describe('dayComplete', () => {
  it('needs every active item checked', () => {
    expect(dayComplete(['a', 'b'], ['a'])).toBe(false)
    expect(dayComplete(['a', 'b'], ['b', 'a', 'x'])).toBe(true)
    expect(dayComplete([], [])).toBe(false)
  })
})

describe('presets: detailed log type', () => {
  it('maps log types to the presets', () => {
    expect(PRESETS.read.logType).toBe('reading')
    expect(PRESETS.gym.logType).toBe('workout')
    expect(PRESETS.water.logType).toBe('quantity')
    expect(customDraft().logType).toBe('none')
  })

  it('refuses a detailed log on a habit with steps', () => {
    expect(validateHabitDraft({ ...presetDraft('eat_well'), logType: 'reading' })).toEqual({
      ok: false,
      error: 'Un hábito con pasos no lleva registro detallado.',
    })
  })
})

describe('normalizeHabitDraft', () => {
  it('clears quantity when the log type is not quantity', () => {
    const d = { ...presetDraft('water'), logType: 'none' as const }
    expect(validateHabitDraft(d)).toEqual({ ok: true })
    expect(normalizeHabitDraft(d).quantity).toBeNull()
    expect(normalizeHabitDraft({ ...presetDraft('walk'), logType: 'workout' }).quantity).toBeNull()
  })
  it('keeps quantity for quantity habits and still errors on a missing or invalid one', () => {
    const d = presetDraft('water')
    expect(normalizeHabitDraft(d)).toEqual(d)
    expect(validateHabitDraft({ ...d, quantity: null })).toEqual({ ok: false, error: 'Configura la meta diaria.' })
  })
})

describe('presets (v4)', () => {
  it('ships the new presets and log types', () => {
    expect(PRESETS.study.logType).toBe('time')
    expect(PRESETS.watch).toMatchObject({ name: 'Series y películas', icon: 'laptop', logType: 'watch' })
    expect(PRESETS.run).toMatchObject({ name: 'Trotar', icon: 'sneaker-move', logType: 'cardio', frequency: { type: 'weekly', target: 3 } })
    expect(PRESETS.water.quantity).toEqual({ unit: 'ml', label: null, target: 2000, step: 250, display: 'glasses', glassMl: 250 })
    expect(PRESETS.walk.quantity?.target).toBe(8000)
    expect(PRESETS.walk.logType).toBe('quantity')
    expect(customDraft().quantity).toBeNull()
  })
  it('copies the quantity config into a draft', () => {
    const d = presetDraft('water')
    expect(d.quantity).toEqual(PRESETS.water.quantity)
    expect(d.quantity).not.toBe(PRESETS.water.quantity)
  })
  it('refuses photo with quantity or time, and quantity without a goal', () => {
    expect(validateHabitDraft({ ...presetDraft('water'), requiresPhoto: true })).toEqual({
      ok: false,
      error: 'Un hábito con foto no lleva tiempo ni cantidad.',
    })
    expect(validateHabitDraft({ ...presetDraft('study'), requiresPhoto: true })).toEqual({
      ok: false,
      error: 'Un hábito con foto no lleva tiempo ni cantidad.',
    })
    expect(validateHabitDraft({ ...presetDraft('water'), quantity: null })).toEqual({
      ok: false,
      error: 'Configura la meta diaria.',
    })
    // photo rule goes by log type: a stale quantity on a "none" habit is just normalised away
    expect(validateHabitDraft({ ...presetDraft('water'), logType: 'none', requiresPhoto: true })).toEqual({ ok: true })
    const bad = { ...(PRESETS.water.quantity as NonNullable<typeof PRESETS.water.quantity>), target: 0 }
    expect(validateHabitDraft({ ...presetDraft('water'), quantity: bad })).toEqual({
      ok: false,
      error: 'La meta debe ser mayor que 0.',
    })
    for (const key of ['water', 'walk', 'study', 'watch', 'run'] as const) {
      expect(validateHabitDraft(presetDraft(key))).toEqual({ ok: true })
    }
  })
})
