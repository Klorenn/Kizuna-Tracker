import type { LocalDate } from '@/domain/types'

/** A real calendar date written as YYYY-MM-DD. */
export function isLocalDate(s: string): s is LocalDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** The day a log page edits: `?fecha=` when it is a valid date not after today, else today. */
export function logDateParam(raw: string | string[] | undefined, today: LocalDate): LocalDate {
  if (typeof raw !== 'string' || !isLocalDate(raw) || raw > today) return today
  return raw
}
