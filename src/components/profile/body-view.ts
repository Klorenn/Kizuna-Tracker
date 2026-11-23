import type { MonthKey } from '@/domain/calendar'
import { monthTitle } from '@/domain/calendar'
import { formatKg1, type WeightEntry } from '@/domain/body'
import type { LocalDate } from '@/domain/types'

// Pure view helpers for the private body weight screens (Perfil card and /resumen/peso).

export type WeightRange = '3m' | '6m' | '1a' | 'todo'

export const RANGES: { value: WeightRange; label: string; months: number | null }[] = [
  { value: '3m', label: '3 m', months: 3 },
  { value: '6m', label: '6 m', months: 6 },
  { value: '1a', label: '1 año', months: 12 },
  { value: 'todo', label: 'Todo', months: null },
]

/** The `?rango=` value; anything unknown (or repeated) falls back to 6 months. */
export function parseRange(raw: string | string[] | undefined): WeightRange {
  return RANGES.find((r) => r.value === raw)?.value ?? '6m'
}

/** First day of the range (inclusive), counted back in calendar months; null for Todo. */
export function rangeFrom(range: WeightRange, today: LocalDate): LocalDate | null {
  const months = RANGES.find((r) => r.value === range)?.months
  if (!months) return null
  const total = Number(today.slice(0, 4)) * 12 + (Number(today.slice(5, 7)) - 1) - months
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const d = Math.min(Number(today.slice(8, 10)), lastDay)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "20 nov", with the year ("31 dic 2025") when it is not the current one. */
export function entryDateLabel(date: LocalDate, today: LocalDate): string {
  const base = `${Number(date.slice(8, 10))} ${SHORT_MONTHS[Number(date.slice(5, 7)) - 1]}`
  return date.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${date.slice(0, 4)}`
}

/** "Noviembre 2026". */
export function monthRowLabel(month: MonthKey): string {
  const { name, year } = monthTitle(month)
  return `${name} ${year}`
}

/** Text alternative for the weight chart (role="img"). */
export function weightAlt(series: WeightEntry[], today: LocalDate): string {
  if (series.length === 0) return 'Evolución del peso: sin registros en este periodo.'
  const first = series[0]
  const last = series[series.length - 1]
  if (series.length === 1) {
    return `Evolución del peso: 1 registro, ${formatKg1(first.kg)} el ${entryDateLabel(first.date, today)}.`
  }
  const kgs = series.map((e) => e.kg)
  return (
    `Evolución del peso: ${series.length} registros. ` +
    `De ${formatKg1(first.kg)} el ${entryDateLabel(first.date, today)} a ${formatKg1(last.kg)} el ${entryDateLabel(last.date, today)}. ` +
    `Mínimo ${formatKg1(Math.min(...kgs))}, máximo ${formatKg1(Math.max(...kgs))}.`
  )
}
