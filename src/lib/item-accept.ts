import { CREATE_NEW, defaultAcceptSelection } from '@/lib/challenge-accept'
import { frequencyLabel } from '@/lib/challenge-view'
import type { LocalDate } from '@/domain/types'

/** A sub-reto the viewer has to answer, as far as the accept sheet cares. */
export type PendingItem = {
  id: string
  /** The proposer habit name. */
  theirHabit: string
  requiresPhoto: boolean
  /** false when the proposer habit could not be read: "Crear" is not offered. */
  sourceReadable: boolean
}

type Habit = { id: string; name: string; requiresPhoto: boolean }

/** Photo sub-retos only take photo habits. */
export const eligibleFor = (habits: Habit[], requiresPhoto: boolean): Habit[] =>
  habits.filter((h) => !requiresPhoto || h.requiresPhoto)

/** itemId -> option the sheet starts on ("Crear" or a habit id; '' when nothing can be chosen). */
export function initialItemSelection(items: PendingItem[], habits: Habit[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of items) {
    const eligible = eligibleFor(habits, i.requiresPhoto)
    out[i.id] = i.sourceReadable
      ? defaultAcceptSelection(i.theirHabit, eligible).selected
      : (eligible[0]?.id ?? '')
  }
  return out
}

/** The selection as the server action takes it. */
export function toAcceptChoices(selection: Record<string, string>): Record<string, 'create' | { habitId: string }> {
  return Object.fromEntries(
    Object.entries(selection).map(([id, v]) => [id, v === CREATE_NEW ? ('create' as const) : { habitId: v }]),
  )
}

/** Every item needs a choice and no existing habit may be picked twice (the database refuses it too). */
export function acceptSelectionReady(selection: Record<string, string>): { ok: true } | { ok: false; error: string } {
  const values = Object.values(selection)
  if (values.some((v) => !v)) return { ok: false, error: 'Elige un hábito para cada sub-reto.' }
  const existing = values.filter((v) => v !== CREATE_NEW)
  if (new Set(existing).size !== existing.length) return { ok: false, error: 'Elige un hábito distinto para cada sub-reto.' }
  return { ok: true }
}

/** "Diario" / "3 por semana", plus " · Con foto". */
export function itemSummary(target: number | null, requiresPhoto: boolean): string {
  const f = frequencyLabel(target === null ? { type: 'daily' } : { type: 'weekly', target })
  return requiresPhoto ? `${f} · Con foto` : f
}

export type ItemRowData = {
  id: string
  status: 'proposed' | 'active'
  pendingFor: 'me' | 'them' | null
  /** '' while the viewer has not chosen a habit. */
  myName: string
  theirName: string
  target: number | null
  requiresPhoto: boolean
  startsOn: LocalDate | null
}

/** Title and (for pending ones) whose turn it is. */
export function itemRowText(i: ItemRowData, otherName: string): { title: string; status: string | null } {
  if (i.pendingFor === 'me') return { title: i.theirName || 'Hábito', status: `${otherName} lo propone` }
  if (i.pendingFor === 'them') return { title: i.myName || 'Hábito', status: `Esperando a ${otherName}` }
  const title = i.myName === i.theirName || !i.theirName ? i.myName : `${i.myName} · ${i.theirName}`
  return { title: title || 'Hábito', status: null }
}
