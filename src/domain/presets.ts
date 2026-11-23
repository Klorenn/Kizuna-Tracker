import { DEFAULT_HABIT_COLOR, PRESET_COLOR, isHabitColor, type HabitColor } from './habit-colors'
import type { LogType } from './logs'
import { validateQuantityConfig, type QuantityConfig } from './quantity'
import type { Frequency } from './types'

export type Visibility = 'private' | 'friends' | 'public'
export type PresetKey = 'gym' | 'water' | 'study' | 'read' | 'walk' | 'sleep' | 'eat_well' | 'watch' | 'run'

export const HABIT_ICONS = [
  'barbell',
  'drop',
  'book-open',
  'book',
  'laptop',
  'desk',
  'sneaker-move',
  'moon',
  'fork-knife',
  'flame',
  'target',
  'clock',
  'calendar-blank',
  'bell',
  'camera',
  'pencil-simple',
  'gear',
  'trophy',
  'chart-bar',
  'house',
  'users',
  'globe-simple',
  'image',
  'receipt',
  'flag',
  'check',
] as const
export type IconKey = (typeof HABIT_ICONS)[number]

export type HabitItemDraft = { label: string; requiresPhoto: boolean }
export type HabitDraft = {
  name: string
  icon: IconKey
  frequency: Frequency
  requiresPhoto: boolean
  items: HabitItemDraft[]
  visibility: Visibility
  preset: PresetKey | null
  color: HabitColor
  logType: LogType
  /** Daily goal of a `quantity` habit; null for every other log type. */
  quantity: QuantityConfig | null
}

export const MAX_ITEMS = 12
export const MAX_NAME = 60
export const MAX_ITEM_LABEL = 40

const base = (preset: PresetKey) => ({
  visibility: 'friends' as Visibility,
  requiresPhoto: false,
  items: [] as HabitItemDraft[],
  color: PRESET_COLOR[preset],
  logType: 'none' as LogType,
  quantity: null as QuantityConfig | null,
})
const daily: Frequency = { type: 'daily' }

export const PRESETS: Readonly<Record<PresetKey, HabitDraft>> = {
  gym: {
    ...base('gym'),
    name: 'Gimnasio',
    icon: 'barbell',
    frequency: { type: 'weekly', target: 4 },
    requiresPhoto: true,
    preset: 'gym',
    logType: 'workout',
  },
  water: {
    ...base('water'),
    name: 'Agua',
    icon: 'drop',
    frequency: daily,
    preset: 'water',
    logType: 'quantity',
    quantity: { unit: 'ml', label: null, target: 2000, step: 250, display: 'glasses', glassMl: 250 },
  },
  study: {
    ...base('study'),
    name: 'Estudiar',
    icon: 'book-open',
    frequency: { type: 'weekly', target: 5 },
    preset: 'study',
    logType: 'time',
  },
  read: {
    ...base('read'),
    name: 'Leer',
    icon: 'book',
    frequency: daily,
    preset: 'read',
    logType: 'reading',
  },
  walk: {
    ...base('walk'),
    name: 'Caminar',
    icon: 'sneaker-move',
    frequency: daily,
    preset: 'walk',
    logType: 'quantity',
    quantity: { unit: 'steps', label: null, target: 8000, step: 1000, display: 'base', glassMl: 250 },
  },
  sleep: { ...base('sleep'), name: 'Dormir 8 h', icon: 'moon', frequency: daily, preset: 'sleep' },
  eat_well: {
    ...base('eat_well'),
    name: 'Comer bien',
    icon: 'fork-knife',
    frequency: daily,
    items: ['Desayuno', 'Almuerzo', 'Once', 'Cena'].map((label) => ({ label, requiresPhoto: false })),
    preset: 'eat_well',
  },
  watch: {
    ...base('watch'),
    name: 'Series y películas',
    icon: 'laptop', // TODO: 'television' once the icon set gets it (owner's decision)
    frequency: { type: 'weekly', target: 3 },
    preset: 'watch',
    logType: 'watch',
  },
  run: {
    ...base('run'),
    name: 'Trotar',
    icon: 'sneaker-move',
    frequency: { type: 'weekly', target: 3 },
    preset: 'run',
    logType: 'cardio',
  },
}

export const PRESET_KEYS = Object.keys(PRESETS) as PresetKey[]

function copy(d: HabitDraft): HabitDraft {
  return {
    ...d,
    frequency: { ...d.frequency },
    items: d.items.map((i) => ({ ...i })),
    quantity: d.quantity === null ? null : { ...d.quantity },
  }
}

export function presetDraft(key: PresetKey): HabitDraft {
  return copy(PRESETS[key])
}

/** "Otro": a blank habit. */
export function customDraft(): HabitDraft {
  return {
    name: '',
    icon: 'target',
    frequency: { type: 'daily' },
    requiresPhoto: false,
    items: [],
    visibility: 'friends',
    preset: null,
    color: DEFAULT_HABIT_COLOR,
    logType: 'none',
    quantity: null,
  }
}

/** The database pairs `log_type = 'quantity'` with the quantity columns: any other type carries none. */
export function normalizeHabitDraft(d: HabitDraft): HabitDraft {
  return d.logType !== 'quantity' && d.quantity !== null ? { ...d, quantity: null } : d
}

export function validateHabitDraft(d: HabitDraft): { ok: true } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error })
  const name = d.name.trim()
  if (name.length === 0) return fail('Ponle un nombre al hábito.')
  if (name.length > MAX_NAME) return fail(`El nombre puede tener hasta ${MAX_NAME} caracteres.`)
  if (!(HABIT_ICONS as readonly string[]).includes(d.icon)) return fail('Elige un ícono.')
  if (!['private', 'friends', 'public'].includes(d.visibility)) return fail('Elige quién puede ver el hábito.')
  if (d.preset !== null && !(d.preset in PRESETS)) return fail('Hábito predefinido no válido.')
  if (!isHabitColor(d.color)) return fail('Elige un color.')
  if (d.frequency.type === 'weekly') {
    const t = d.frequency.target
    if (!Number.isInteger(t) || t < 1 || t > 7) return fail('Elige entre 1 y 7 veces por semana.')
  } else if (d.frequency.type !== 'daily') {
    return fail('Elige la frecuencia del hábito.')
  }
  if (d.items.length > MAX_ITEMS) return fail(`Puedes agregar hasta ${MAX_ITEMS} pasos.`)
  if (d.items.length > 0 && d.requiresPhoto) {
    return fail('Un hábito con pasos pide la foto en cada paso, no en el hábito.')
  }
  if (d.items.length > 0 && d.logType !== 'none') {
    return fail('Un hábito con pasos no lleva registro detallado.')
  }
  if (d.requiresPhoto && (d.logType === 'time' || d.logType === 'quantity')) {
    return fail('Un hábito con foto no lleva tiempo ni cantidad.')
  }
  // A draft with another log type carries no goal (see normalizeHabitDraft); only quantity needs one.
  if (d.logType === 'quantity') {
    if (d.quantity === null) return fail('Configura la meta diaria.')
    const q = validateQuantityConfig(d.quantity)
    if (!q.ok) return q
  }
  const seen = new Set<string>()
  for (const item of d.items) {
    const label = item.label.trim()
    if (label.length === 0) return fail('Cada paso necesita un nombre.')
    if (label.length > MAX_ITEM_LABEL) {
      return fail(`El nombre de un paso puede tener hasta ${MAX_ITEM_LABEL} caracteres.`)
    }
    const key = label.toLocaleLowerCase('es')
    if (seen.has(key)) return fail('Los pasos no pueden repetirse.')
    seen.add(key)
  }
  return { ok: true }
}

/** The day counts when every active item is checked (and there is at least one). */
export function dayComplete(activeItemIds: string[], checkedItemIds: string[]): boolean {
  if (activeItemIds.length === 0) return false
  const checked = new Set(checkedItemIds)
  return activeItemIds.every((id) => checked.has(id))
}
