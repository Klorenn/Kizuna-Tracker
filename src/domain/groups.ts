import { HABIT_COLORS } from '@/domain/habit-colors'
import { HABIT_ICONS } from '@/domain/presets'
import { GROUP_LIMITS, type GroupCommitment, type GroupDraft, type GroupHabitChoice } from '@/lib/groups-contract'

/** Pure rules and wording of Grupos: no I/O. The server actions validate with these before any call. */

export const INVALID_GROUP_COPY = 'Revisa los datos del grupo.'
export const NAME_COPY = 'El nombre debe tener entre 3 y 40 letras.'
export const DESCRIPTION_COPY = 'La descripción puede tener hasta 140 letras.'
export const COMMITMENT_REQUIRED_COPY = 'Escribe el compromiso del grupo.'
export const COMMITMENT_LONG_COPY = 'El compromiso puede tener hasta 40 letras.'
export const TARGET_COPY = 'Elige entre 1 y 7 veces por semana.'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v)
}

/** A real calendar date written "YYYY-MM-DD" (so "2026-02-30" is not one). */
export function isLocalDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/** Invitation codes: 8 characters, no 0, 1, I or O. Canonical form is upper case with no separator. */
export const INVITE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const CANONICAL = /^[2-9A-HJ-NP-Z]{8}$/
const ASCII_CODE = /^[2-9A-HJ-NP-Za-hj-np-z]{8}$/

/** The canonical shape only. Checked before any database call. */
export function isInviteCodeShape(v: unknown): v is string {
  return typeof v === 'string' && CANONICAL.test(v)
}

/**
 * What a person may type or paste -> the canonical code, or null. Exactly the database's `groups_normalize_code`: longer than
 * 64 characters is invalid at once; every ASCII whitespace character (space, \t \n \v \f \r: what Postgres `\s` strips; NOT NBSP, U+202F, U+2007, U+FEFF) and at most one hyphen are removed; the rest must be 8 ASCII
 * characters of the alphabet in either case (checked BEFORE upper-casing, so a ligature or full-width letters never become
 * letters); then upper-case.
 */
export function normalizeInviteCode(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 64) return null
  const noSpace = v.replace(/[\t\n\v\f\r ]/g, '')
  if (noSpace.split('-').length > 2) return null
  const joined = noSpace.replace('-', '')
  return ASCII_CODE.test(joined) ? joined.toUpperCase() : null
}

/** "K7QM4PXD" -> "K7QM-4PXD" (how people see and say it). */
export function formatInviteCode(code: string): string {
  return isInviteCodeShape(code) ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

/** The public path of an invitation: "/g/K7QM4PXD". */
export function inviteUrlPath(code: string): string {
  return `/g/${code}`
}

/** Length in characters as a person counts them (an emoji is one). */
function len(s: string): number {
  return Array.from(s).length
}

export type GroupFields = { name: string; icon: string; color: string; description: string }

type Checked<K extends string, T> = ({ ok: true } & { [P in K]: T }) | { ok: false; error: string }

const fail = (error: string) => ({ ok: false as const, error })

function validateFields(f: unknown): Checked<'fields', GroupFields> {
  if (!f || typeof f !== 'object') return fail(INVALID_GROUP_COPY)
  const o = f as Record<string, unknown>
  const name = typeof o.name === 'string' ? o.name.trim() : ''
  if (len(name) < GROUP_LIMITS.nameMin || len(name) > GROUP_LIMITS.nameMax) return fail(NAME_COPY)
  const description = o.description === undefined || o.description === null ? '' : o.description
  if (typeof description !== 'string') return fail(INVALID_GROUP_COPY)
  const desc = description.trim()
  if (len(desc) > GROUP_LIMITS.descriptionMax) return fail(DESCRIPTION_COPY)
  if (typeof o.icon !== 'string' || !(HABIT_ICONS as readonly string[]).includes(o.icon)) return fail(INVALID_GROUP_COPY)
  if (typeof o.color !== 'string' || !(HABIT_COLORS as readonly string[]).includes(o.color)) return fail(INVALID_GROUP_COPY)
  return { ok: true, fields: { name, icon: o.icon, color: o.color, description: desc } }
}

export function validateGroupFields(f: GroupFields): Checked<'fields', GroupFields> {
  return validateFields(f)
}

export function validateCommitment(c: GroupCommitment): Checked<'commitment', GroupCommitment> {
  if (!c || typeof c !== 'object') return fail(INVALID_GROUP_COPY)
  const o = c as Record<string, unknown>
  const name = typeof o.name === 'string' ? o.name.trim() : ''
  if (name === '') return fail(COMMITMENT_REQUIRED_COPY)
  if (len(name) > GROUP_LIMITS.commitmentMax) return fail(COMMITMENT_LONG_COPY)
  const t = o.targetPerWeek
  if (typeof t !== 'number' || !Number.isInteger(t) || t < GROUP_LIMITS.targetMin || t > GROUP_LIMITS.targetMax) {
    return fail(TARGET_COPY)
  }
  if (typeof o.icon !== 'string' || !(HABIT_ICONS as readonly string[]).includes(o.icon)) return fail(INVALID_GROUP_COPY)
  if (typeof o.requiresPhoto !== 'boolean') return fail(INVALID_GROUP_COPY)
  return { ok: true, commitment: { name, icon: o.icon, targetPerWeek: t, requiresPhoto: o.requiresPhoto } }
}

export function validateHabitChoice(h: unknown): Checked<'habit', GroupHabitChoice> {
  if (!h || typeof h !== 'object') return fail(INVALID_GROUP_COPY)
  const o = h as Record<string, unknown>
  if (o.kind === 'create') return { ok: true, habit: { kind: 'create' } }
  if (o.kind === 'habit' && isUuid(o.habitId)) return { ok: true, habit: { kind: 'habit', habitId: o.habitId } }
  return fail(INVALID_GROUP_COPY)
}

/** The whole draft, returned normalised (trimmed). The first failing rule wins, in form order. */
export function validateGroupDraft(d: GroupDraft): Checked<'draft', GroupDraft> {
  if (!d || typeof d !== 'object') return fail(INVALID_GROUP_COPY)
  const fields = validateFields(d)
  if (!fields.ok) return fields
  const commitment = validateCommitment(d.commitment)
  if (!commitment.ok) return commitment
  const habit = validateHabitChoice(d.habit)
  if (!habit.ok) return habit
  return { ok: true, draft: { ...fields.fields, commitment: commitment.commitment, habit: habit.habit } }
}

/** "Gym · 3 por semana", "Gym · todos los días", plus " · con foto". */
export function commitmentLine(c: GroupCommitment): string {
  const when = c.targetPerWeek === 7 ? 'todos los días' : `${c.targetPerWeek} por semana`
  return `${c.name} · ${when}${c.requiresPhoto ? ' · con foto' : ''}`
}

export const compliedLabel = (complied: number, counted: number) => `Cumplen ${complied} de ${counted} esta semana`
export const weekCompliedLabel = (complied: number, counted: number) => `Cumplieron ${complied} de ${counted}`

export function myProgressLabel(counts: boolean, done: number, target: number): string {
  return counts ? `Tú: ${done} de ${target}` : 'Empiezas el lunes'
}

/** Null at 0: the line is hidden. */
export function streakLabel(weeks: number): string | null {
  if (!(weeks > 0)) return null
  return `Racha del grupo: ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** "2026-11-30" -> "30 de noviembre". Anything that is not a date comes back untouched. */
export function dateLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return date
  const month = MONTHS[Number(m[2]) - 1]
  return month ? `${Number(m[3])} de ${month}` : date
}

export const weekLabel = (weekStart: string) => `Semana del ${dateLabel(weekStart)}`

export function pendingCommitmentLabel(p: GroupCommitment & { effectiveFrom: string }): string {
  return `Desde el lunes ${dateLabel(p.effectiveFrom)}: ${p.name} · ${p.targetPerWeek} por semana`
}
