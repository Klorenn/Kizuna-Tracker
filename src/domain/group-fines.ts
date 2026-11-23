import { formatCLP } from '@/domain/ledger'
import { dateLabel } from '@/domain/groups'
import { FINE_LIMITS } from '@/lib/groups-fines-contract'

/** Pure rules and wording of the group fine: no I/O. The server actions validate with these before any call. */

export const INVALID_FINE_COPY = 'El monto debe estar entre $1 y $100.000 y el fondo necesita un nombre.'
export const INVALID_REASON_COPY = 'Escribe un motivo de hasta 140 letras.'
export const FUND_DISCLAIMER = 'La app solo registra. El pago se hace fuera de la app.'

/** Length in characters as a person counts them (an emoji is one). */
const len = (s: string) => Array.from(s).length

type Checked<K extends string, T> = ({ ok: true } & { [P in K]: T }) | { ok: false; error: string }

/** A whole number of pesos within `FINE_LIMITS` and a trimmed purpose of 1..80 characters. Anything else is refused. */
export function validateFineProposal(amount: unknown, purpose: unknown): { ok: true; amount: number; purpose: string } | { ok: false; error: string } {
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < FINE_LIMITS.amountMin || amount > FINE_LIMITS.amountMax) {
    return { ok: false, error: INVALID_FINE_COPY }
  }
  if (typeof purpose !== 'string') return { ok: false, error: INVALID_FINE_COPY }
  const p = purpose.trim()
  if (len(p) < 1 || len(p) > FINE_LIMITS.purposeMax) return { ok: false, error: INVALID_FINE_COPY }
  return { ok: true, amount, purpose: p }
}

/** The reason of a photo rejection, trimmed, 1..140 characters. */
export function validateRejectReason(reason: unknown): Checked<'reason', string> {
  if (typeof reason !== 'string') return { ok: false, error: INVALID_REASON_COPY }
  const r = reason.trim()
  if (len(r) < 1 || len(r) > FINE_LIMITS.reasonMax) return { ok: false, error: INVALID_REASON_COPY }
  return { ok: true, reason: r }
}

export const acceptedLabel = (accepted: number, needed: number) => `Aceptaron ${accepted} de ${needed} necesarios`
export const proposalHeadline = (name: string, amount: number) => `${name} propone una multa de ${formatCLP(amount)} por semana incumplida`
export const fineHeadline = (amount: number) => `Multa activa: ${formatCLP(amount)} por semana incumplida`
export const boundSinceLabel = (from: string) => `Participas desde el lunes ${dateLabel(from)}`
export const debtWeekLabel = (weekStart: string, amount: number) => `Semana del ${dateLabel(weekStart)} · ${formatCLP(amount)}`
export const owedLabel = (amount: number, groupName: string) => `Le debes ${formatCLP(amount)} al fondo de ${groupName}`
export const administeredLabel = (groupName: string, amount: number) => `${groupName}: ${formatCLP(amount)} pendiente en el fondo`
