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
