import { toHabitColor } from '@/domain/habit-colors'
import { LOG_TYPE_LABEL, type LogType } from '@/domain/logs'
import { HABIT_ICONS, normalizeHabitDraft, validateHabitDraft, type HabitDraft, type IconKey } from '@/domain/presets'
import type { QuantityConfig, QuantityUnit } from '@/domain/quantity'
import type { Frequency } from '@/domain/types'
import { draftExtraError } from '@/lib/habit-draft-checks'
import { frequencyLabel } from '@/lib/challenge-view'

/** Value of the "Crear «…»" option in the accept sheet (never a habit id). */
export const CREATE_NEW = '__create__'

/** Trimmed, case- and accent-insensitive form of a habit name. */
function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLocaleLowerCase('es')
}

export function sameHabitName(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b)
}

/**
 * Which option the accept sheet starts on. A habit with the proposed name wins and "Crear" goes
 * away (it would only duplicate it); otherwise "Crear" is selected.
 */
export function defaultAcceptSelection(
  proposedName: string,
  habits: readonly { id: string; name: string }[],
): { selected: string; canCreate: boolean } {
  const same = habits.find((h) => sameHabitName(h.name, proposedName))
  return same ? { selected: same.id, canCreate: false } : { selected: CREATE_NEW, canCreate: true }
}

/** "Hábito nuevo · 3 por semana" / "Hábito nuevo · todos los días", plus " · con foto". */
export function createSubline(frequency: Frequency, requiresPhoto: boolean): string {
  const when = frequency.type === 'daily' ? 'todos los días' : frequencyLabel(frequency)
  return `Hábito nuevo · ${when}${requiresPhoto ? ' · con foto' : ''}`
}

/** The kind of record in words: the habit form's labels, with "Solo marcar" for the plain check. */
export function habitKindLabel(logType: string): string {
  if (logType === 'none' || !(logType in LOG_TYPE_LABEL)) return 'Solo marcar'
  return LOG_TYPE_LABEL[logType as LogType]
}

/** What is read of the proposer's habit: only what the new habit copies. */
export type SourceHabit = {
  name: string
  icon: string
  color: string
  logType: string
  quantity: QuantityConfig | null
}

/** Columns to select (with the caller's own session) to build a `SourceHabit`. */
export const SOURCE_HABIT_COLUMNS =
  'name,icon,color,log_type,quantity_unit,quantity_label,quantity_target,quantity_step,quantity_display,glass_ml'

export type SourceHabitRow = {
  name: string
  icon: string
  color: string
  log_type: string
  quantity_unit: string | null
  quantity_label: string | null
  quantity_target: number | null
  quantity_step: number | null
  quantity_display: string
  glass_ml: number
}

export function sourceFromRow(row: SourceHabitRow): SourceHabit {
  const hasQuantity = row.log_type === 'quantity' && row.quantity_unit !== null
  return {
    name: row.name,
    icon: row.icon,
    color: row.color,
    logType: row.log_type,
    quantity: hasQuantity
      ? {
          unit: row.quantity_unit as QuantityUnit,
          label: row.quantity_label,
          target: Number(row.quantity_target),
          step: Number(row.quantity_step),
          display: row.quantity_display === 'glasses' ? 'glasses' : 'base',
          glassMl: row.glass_ml,
        }
      : null,
  }
}

function draftOf(
  source: SourceHabit,
  challenge: { frequency: Frequency; requiresPhoto: boolean },
  logType: LogType,
  quantity: QuantityConfig | null,
): HabitDraft {
  return {
    name: source.name,
    icon: (HABIT_ICONS as readonly string[]).includes(source.icon) ? (source.icon as IconKey) : 'target',
    frequency: { ...challenge.frequency },
    requiresPhoto: challenge.requiresPhoto,
    items: [],
    visibility: 'friends',
    preset: null,
    color: toHabitColor(source.color),
    logType,
    quantity: quantity === null ? null : { ...quantity },
  }
}

/**
 * The new habit of someone who accepts with "Crear": name, icon, colour and log type (with its
 * settings) come from the proposer's habit; frequency and photo come from the challenge; visibility
 * is Amigos; nothing else. When the log type does not validate for the new habit (a photo habit
 * cannot log time or quantity, bad settings) it becomes "Solo marcar" and `simpleFallback` is set.
 */
export function habitDraftFromChallenge(
  source: SourceHabit,
  challenge: { frequency: Frequency; requiresPhoto: boolean },
): { draft: HabitDraft; simpleFallback: boolean } {
  const copied = normalizeHabitDraft(draftOf(source, challenge, source.logType as LogType, source.quantity))
  if (draftExtraError(copied) === null && validateHabitDraft(copied).ok) {
    return { draft: copied, simpleFallback: false }
  }
  return { draft: draftOf(source, challenge, 'none', null), simpleFallback: source.logType !== 'none' }
}
