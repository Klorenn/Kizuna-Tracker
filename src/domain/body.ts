import { monthOf, type MonthKey } from './calendar'
import { parseKg } from './logs'
import type { LocalDate } from './types'

// Private body weight and height. Strictly owner-only: nothing here is ever shown to friends,
// on the public profile, in the feed or in notifications. kg and cm only; no BMI, no goals.

export { parseKg }

export type WeightEntry = { date: LocalDate; kg: number }

const round2 = (x: number) => Math.round(x * 100) / 100
const byDate = (a: WeightEntry, b: WeightEntry) => a.date.localeCompare(b.date)

export function latestWeight(entries: WeightEntry[]): WeightEntry | null {
  if (entries.length === 0) return null
  return [...entries].sort(byDate)[entries.length - 1]
}

/** Entries from `from` to `to` (both included), oldest first. */
export function weightSeries(entries: WeightEntry[], from: LocalDate, to: LocalDate): WeightEntry[] {
  return entries.filter((e) => e.date >= from && e.date <= to).sort(byDate)
}

/**
 * How much the weight moved during `month`: its last entry minus the last entry before the
 * month, or, with nothing earlier, minus the first entry of the month. null with fewer than
 * two points.
 */
export function monthlyWeightChange(entries: WeightEntry[], month: MonthKey): number | null {
  const sorted = [...entries].sort(byDate)
  const inMonth = sorted.filter((e) => monthOf(e.date) === month)
  if (inMonth.length === 0) return null
  const last = inMonth[inMonth.length - 1]
  const before = sorted.filter((e) => monthOf(e.date) < month)
  if (before.length > 0) return round2(last.kg - before[before.length - 1].kg)
  if (inMonth.length >= 2) return round2(last.kg - inMonth[0].kg)
  return null
}

export function monthlyWeightSummary(
  entries: WeightEntry[],
  months: MonthKey[],
): { month: MonthKey; last: number | null; change: number | null }[] {
  const sorted = [...entries].sort(byDate)
  return months.map((month) => {
    const inMonth = sorted.filter((e) => monthOf(e.date) === month)
    return {
      month,
      last: inMonth.length > 0 ? inMonth[inMonth.length - 1].kg : null,
      change: monthlyWeightChange(entries, month),
    }
  })
}

const comma = (n: number, digits: number) => n.toFixed(digits).replace('.', ',')

/** 72,4 kg (one decimal shown; two are stored). */
export const formatKg1 = (n: number): string => `${comma(n, 1)} kg`

/** +1,2 kg / −1,2 kg with a true minus sign. */
export function formatSignedKg1(n: number): string {
  const r = Math.round(n * 10) / 10
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${comma(Math.abs(r), 1)} kg`
}

/** 172 cm / 172,5 cm. */
export const formatCm = (n: number): string => `${Number.isInteger(n) ? n : comma(n, 1)} cm`

/** A body weight typed by the user: comma or point, 20 to 400 kg; anything else is null. */
export function parseWeightKg(raw: string): number | null {
  const s = raw.trim().replace(',', '.')
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null
  const n = Number(s)
  return n >= 20 && n <= 400 ? n : null
}
