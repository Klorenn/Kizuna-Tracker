import { formatCLP } from '@/domain/ledger'
import type { Frequency } from '@/domain/types'

export type RejectReason = 'not_habit' | 'duplicate' | 'unclear' | 'other'

export const REJECT_REASONS: readonly RejectReason[] = ['not_habit', 'duplicate', 'unclear', 'other']

export const REJECT_LABEL: Record<RejectReason, string> = {
  not_habit: 'No es del hábito',
  duplicate: 'Foto repetida',
  unclear: 'No se ve nada',
  other: 'Otro',
}

export const MAX_FINE = 10_000_000
export const MAX_WEEKS = 52

export type ChallengeInput = {
  rivalId: string
  habitId: string
  frequency: Frequency
  weeks: number
  fineAmount: number
}

export function validateChallengeInput(input: ChallengeInput): { ok: true } | { ok: false; error: string } {
  if (!input.rivalId) return { ok: false, error: 'Elige a quién retar.' }
  if (!input.habitId) return { ok: false, error: 'Elige un hábito.' }
  if (
    input.frequency.type === 'weekly' &&
    (!Number.isInteger(input.frequency.target) || input.frequency.target < 1 || input.frequency.target > 7)
  ) {
    return { ok: false, error: 'Elige entre 1 y 7 días por semana.' }
  }
  if (!Number.isInteger(input.weeks) || input.weeks < 1 || input.weeks > MAX_WEEKS) {
    return { ok: false, error: 'La duración va de 1 a 52 semanas.' }
  }
  if (!Number.isInteger(input.fineAmount) || input.fineAmount < 1 || input.fineAmount > MAX_FINE) {
    return { ok: false, error: 'La multa debe ser un monto entero entre $1 y $10.000.000.' }
  }
  return { ok: true }
}

export function parseNewChallengeParams(params: URLSearchParams): { habitId: string | null; habitLocked: boolean } {
  const habitId = params.get('habito')
  return habitId ? { habitId, habitLocked: true } : { habitId: null, habitLocked: false }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `/retos/nuevo?amigo=<id>` (from a friend's profile): the friend to preselect, uuid only. */
export function parseRivalParam(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null
}

/** Statuses that count as "you already have a challenge with that person". */
export const OPEN_CHALLENGE_STATUSES = ['proposed', 'active'] as const

/**
 * Other person -> id of the open (proposed or active) challenge shared with them. Rows are expected
 * newest first, so the first one per person wins.
 */
export function openChallengeByRival(
  rows: { id: string; creator_id: string; rival_id: string; status: string }[],
  me: string,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rows) {
    if (!(OPEN_CHALLENGE_STATUSES as readonly string[]).includes(r.status)) continue
    const other = r.creator_id === me ? r.rival_id : r.creator_id
    if (!(other in out)) out[other] = r.id
  }
  return out
}

export function existingChallengeMessage(username: string | null): string {
  return username ? `Ya tienes un reto con @${username}` : 'Ya tienes un reto con esta persona'
}

export type OpenTermsRow = {
  id: string
  creator_id: string
  rival_id: string
  status: string
  frequency_type: string
  target_per_week: number | null
  weeks: number
  fine_amount: number
  starts_on: string | null
  timezone: string
}

/** The terms a new sub-reto inherits: the challenge decides frequency, weeks and fine, not the form. */
export type OpenTerms = {
  id: string
  status: string
  frequency: Frequency
  weeks: number
  fineAmount: number
  startsOn: string | null
  timezone: string
  /** Active: either player adds a sub-reto. Proposed: only the creator (the rival answers the whole challenge). */
  canAdd: boolean
}

/** Other person -> terms of the open challenge shared with them. Rows newest first: the first per person wins. */
export function openTermsByRival(rows: OpenTermsRow[], me: string): Record<string, OpenTerms> {
  const out: Record<string, OpenTerms> = {}
  for (const r of rows) {
    if (!(OPEN_CHALLENGE_STATUSES as readonly string[]).includes(r.status)) continue
    const other = r.creator_id === me ? r.rival_id : r.creator_id
    if (other in out) continue
    out[other] = {
      id: r.id,
      status: r.status,
      frequency:
        r.frequency_type === 'weekly' ? { type: 'weekly', target: r.target_per_week ?? 1 } : { type: 'daily' },
      weeks: r.weeks,
      fineAmount: r.fine_amount,
      startsOn: r.starts_on,
      timezone: r.timezone,
      canAdd: r.status === 'active' || r.creator_id === me,
    }
  }
  return out
}

/** `/retos/nuevo?reto=<id>` (from a challenge): the challenge to add a sub-reto to, uuid only. */
export function parseRetoParam(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null
}

/**
 * Add mode of the new-challenge form: `?reto=` names the challenge, otherwise a preselected friend
 * with an open challenge does. The terms (frequency, weeks, fine) are the challenge's, not the form's.
 */
export function resolveAddMode(
  termsByRival: Record<string, OpenTerms>,
  params: { reto: string | null; rival: string | null },
): { rivalId: string; terms: OpenTerms } | null {
  const hit = params.reto
    ? Object.entries(termsByRival).find(([, t]) => t.id === params.reto)
    : params.rival && params.rival in termsByRival
      ? ([params.rival, termsByRival[params.rival]] as const)
      : undefined
  return hit && hit[1].canAdd ? { rivalId: hit[0], terms: hit[1] } : null
}

export type AddItemInput = { challengeId: string; habitId: string; target: number | null }

/** Weekly challenges need a 1..7 target, daily ones take none; ids must be uuids. */
export function validateAddItemInput(
  input: AddItemInput,
  frequencyType: 'daily' | 'weekly',
): { ok: true } | { ok: false; error: string } {
  if (!UUID.test(input.challengeId)) return { ok: false, error: 'Este reto ya no existe.' }
  if (!UUID.test(input.habitId)) return { ok: false, error: 'Elige un hábito.' }
  if (frequencyType === 'weekly') {
    if (typeof input.target !== 'number' || !Number.isInteger(input.target) || input.target < 1 || input.target > 7) {
      return { ok: false, error: 'Elige entre 1 y 7 días por semana.' }
    }
  } else if (input.target !== null) {
    return { ok: false, error: 'Este reto es diario: el sub-reto no lleva días por semana.' }
  }
  return { ok: true }
}

export type FormMode =
  | { mode: 'new' }
  | { mode: 'add'; terms: OpenTerms }
  | { mode: 'blocked'; challengeId: string }

/** What the form does for the chosen friend: start a challenge, add a sub-reto to the open one, or point at it. */
export function formModeFor(termsByRival: Record<string, OpenTerms>, rivalId: string): FormMode {
  const terms = rivalId ? termsByRival[rivalId] : undefined
  if (!terms) return { mode: 'new' }
  return terms.canAdd ? { mode: 'add', terms } : { mode: 'blocked', challengeId: terms.id }
}

/** "3 por semana", "4 semanas", "$2.500": the inherited terms, as read-only lines of the add form. */
export function termsSummary(t: OpenTerms): string[] {
  return [
    t.frequency.type === 'weekly' ? `${t.frequency.target} por semana` : 'Diario',
    `${t.weeks} ${t.weeks === 1 ? 'semana' : 'semanas'}`,
    formatCLP(t.fineAmount),
  ]
}

/**
 * Terms from the server's "a challenge already exists" answer. It does not say who created it, so only an active
 * challenge (either player adds) is treated as open to sub-retos; a proposed one just points at it.
 */
export function termsFromExisting(
  id: string,
  t: { status: string; frequency: Frequency; weeks: number; fineAmount: number },
): OpenTerms {
  return { id, ...t, startsOn: null, timezone: '', canAdd: t.status === 'active' }
}
