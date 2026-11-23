import type { PresetKey } from './presets'

/**
 * Curated habit identity palette. The database stores these keys (never hex); the colors live in
 * src/styles/tokens.css as --habit-<key> and --habit-<key>-soft, tuned per theme for AA contrast.
 * UI chrome (buttons, focus, selection, nav) keeps the indigo accent: these are identity only.
 */
export const HABIT_COLORS = ['salvia', 'durazno', 'lavanda', 'arena', 'cielo', 'rosa', 'oliva', 'indigo'] as const
export type HabitColor = (typeof HABIT_COLORS)[number]

export const DEFAULT_HABIT_COLOR: HabitColor = 'indigo'

export const HABIT_COLOR_LABEL: Readonly<Record<HabitColor, string>> = {
  salvia: 'Salvia',
  durazno: 'Durazno',
  lavanda: 'Lavanda',
  arena: 'Arena',
  cielo: 'Cielo',
  rosa: 'Rosa',
  oliva: 'Oliva',
  indigo: 'Índigo',
}

/** Default color of each predefined habit (mirrored by public.habit_preset_color in SQL). */
export const PRESET_COLOR: Readonly<Record<PresetKey, HabitColor>> = {
  gym: 'durazno',
  water: 'cielo',
  study: 'lavanda',
  read: 'arena',
  walk: 'salvia',
  sleep: 'indigo',
  eat_well: 'oliva',
}

export function isHabitColor(value: unknown): value is HabitColor {
  return typeof value === 'string' && (HABIT_COLORS as readonly string[]).includes(value)
}

/** Values read back from the db or an RPC: anything unexpected renders as the default. */
export function toHabitColor(value: unknown): HabitColor {
  return isHabitColor(value) ? value : DEFAULT_HABIT_COLOR
}

/** CSS variable for a habit color (`soft` is the low-alpha fill for empty or partial cells). */
export function habitColorVar(color: HabitColor, tone: 'solid' | 'soft' = 'solid'): string {
  return tone === 'soft' ? `var(--habit-${color}-soft)` : `var(--habit-${color})`
}
