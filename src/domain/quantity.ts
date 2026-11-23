import { monthOf, type MonthKey } from './calendar'
import type { LocalDate } from './types'

// Quantity: a measurable daily goal (water, steps...). Amounts are stored in the base unit (ml
// for water); "glasses" is only a view. Pure functions, no I/O.

type Result = { ok: true } | { ok: false; error: string }
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })
const round2 = (x: number) => Math.round(x * 100) / 100

export type QuantityUnit = 'ml' | 'steps' | 'km' | 'times' | 'minutes' | 'custom'
export const QUANTITY_UNITS: readonly QuantityUnit[] = ['ml', 'steps', 'km', 'times', 'minutes', 'custom']

export type QuantityConfig = {
  unit: QuantityUnit
  label: string | null
  target: number
  step: number
  display: 'base' | 'glasses'
  glassMl: number
}

export const MAX_QUANTITY = 100000
export const MAX_QUANTITY_LABEL = 12

/** km and custom units may have decimals; everything else is whole. */
const allowsDecimals = (c: QuantityConfig) => c.unit === 'km' || c.unit === 'custom'

export function validateQuantityConfig(c: QuantityConfig): Result {
  if (!QUANTITY_UNITS.includes(c.unit)) return fail('Elige una unidad.')
  if (c.unit === 'custom') {
    const label = c.label?.trim() ?? ''
    if (label.length === 0 || label.length > MAX_QUANTITY_LABEL) return fail('Escribe la unidad (hasta 12 caracteres).')
  } else if (c.label !== null) {
    return fail('Solo una unidad personalizada lleva nombre.')
  }
  if (c.display !== 'base' && c.display !== 'glasses') return fail('Elige cómo ver la cantidad.')
  if (c.display === 'glasses' && c.unit !== 'ml') return fail('Los vasos solo sirven con ml.')
  if (!Number.isInteger(c.glassMl) || c.glassMl < 50 || c.glassMl > 1000) return fail('El vaso va de 50 a 1.000 ml.')
  if (!Number.isFinite(c.target) || c.target <= 0) return fail('La meta debe ser mayor que 0.')
  if (c.target > MAX_QUANTITY) return fail('La meta no puede superar 100.000.')
  if (!allowsDecimals(c) && !Number.isInteger(c.target)) return fail('La meta debe ser un número entero.')
  if (!Number.isFinite(c.step) || c.step <= 0) return fail('La suma rápida debe ser mayor que 0.')
  if (c.step > c.target) return fail('La suma rápida no puede superar la meta.')
  if (!allowsDecimals(c) && !Number.isInteger(c.step)) return fail('La suma rápida debe ser un número entero.')
  return { ok: true }
}

/** The quick-add step in base units. */
export const stepAmount = (c: QuantityConfig): number => c.step

/** 1.250 / 5,5: es-CL separators without ICU, at most `decimals` decimals, no trailing zeros. */
function num(n: number, decimals: number): string {
  const f = 10 ** decimals
  const [int, frac = ''] = (Math.round(Math.abs(n) * f) / f).toFixed(decimals).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const rest = frac.replace(/0+$/, '')
  return `${n < 0 ? '-' : ''}${grouped}${rest ? `,${rest}` : ''}`
}

const WORDS: Readonly<Record<Exclude<QuantityUnit, 'custom'>, readonly [string, string]>> = {
  ml: ['ml', 'ml'],
  steps: ['paso', 'pasos'],
  km: ['km', 'km'],
  times: ['vez', 'veces'],
  minutes: ['min', 'min'],
}

/** The unit word for a displayed value: "vaso(s)", "paso(s)", the custom label... */
function unitWord(c: QuantityConfig, value: number): string {
  if (c.display === 'glasses') return value === 1 ? 'vaso' : 'vasos'
  if (c.unit === 'custom') return c.label ?? ''
  return WORDS[c.unit][value === 1 ? 0 : 1]
}

/** The value as shown (glasses are rounded to 1 decimal) and the number it was rounded to. */
function shown(amount: number, c: QuantityConfig): { text: string; value: number } {
  if (c.display === 'glasses') {
    const value = Math.round((amount / c.glassMl) * 10) / 10
    return { text: num(value, 1), value }
  }
  const value = round2(amount)
  return { text: num(value, 2), value }
}

export function formatAmount(amount: number, c: QuantityConfig): string {
  const { text, value } = shown(amount, c)
  return `${text} ${unitWord(c, value)}`
}

/** "5 de 8 vasos", "1.250 de 2.000 ml". */
export function progressLabel(total: number, c: QuantityConfig): string {
  const done = shown(total, c)
  const goal = shown(c.target, c)
  return `${done.text} de ${goal.text} ${unitWord(c, goal.value)}`
}

/** What the user typed, in base units (glasses times the glass size); null if not a positive amount. */
export function parseAmount(raw: string, c: QuantityConfig): number | null {
  const s = raw.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const n = Number(s)
  if (!(n > 0)) return null
  let base: number
  if (c.display === 'glasses') {
    base = Math.round(n * c.glassMl)
  } else if (allowsDecimals(c)) {
    base = round2(n)
  } else {
    if (!Number.isInteger(n)) return null
    base = n
  }
  return base > 0 && base <= MAX_QUANTITY ? base : null
}

export type QuantityEntry = { date: LocalDate; amount: number }

export function monthlyQuantity(
  entries: QuantityEntry[],
  doneDates: LocalDate[],
  month: MonthKey,
  c: QuantityConfig,
): {
  month: MonthKey
  total: number
  days: number
  average: number
  reached: number
  bestDay: { date: LocalDate; total: number } | null
} {
  const perDay = new Map<LocalDate, number>()
  for (const e of entries) {
    if (monthOf(e.date) === month) perDay.set(e.date, (perDay.get(e.date) ?? 0) + e.amount)
  }
  let sum = 0
  let bestDay: { date: LocalDate; total: number } | null = null
  for (const [date, total] of perDay) {
    sum += total
    if (bestDay === null || total > bestDay.total || (total === bestDay.total && date < bestDay.date)) {
      bestDay = { date, total: round2(total) }
    }
  }
  const total = round2(sum)
  const mean = perDay.size === 0 ? 0 : total / perDay.size
  return {
    month,
    total,
    days: perDay.size,
    average: allowsDecimals(c) ? round2(mean) : Math.round(mean),
    reached: new Set(doneDates.filter((d) => monthOf(d) === month)).size,
    bestDay,
  }
}

export function quantitySeries(
  entries: QuantityEntry[],
  doneDates: LocalDate[],
  months: MonthKey[],
  c: QuantityConfig,
): { month: MonthKey; average: number; reached: number }[] {
  return months.map((month) => {
    const m = monthlyQuantity(entries, doneDates, month, c)
    return { month, average: m.average, reached: m.reached }
  })
}
