import { addDays, weekStart } from './dates'
import type { LocalDate } from './types'

export type Goal =
  | { id: string; habitId: string; kind: 'weekly'; target: number }
  | { id: string; habitId: string; kind: 'total'; target: number; startsOn: LocalDate; deadline: LocalDate | null }

export type GoalStatus = 'in_progress' | 'done' | 'overdue'

/** Inclusive date range whose check-ins count toward the goal (weekly: this Monday-Sunday week). */
export function goalWindow(goal: Goal, today: LocalDate): { from: LocalDate; to: LocalDate } {
  if (goal.kind === 'weekly') {
    const from = weekStart(today)
    return { from, to: addDays(from, 6) }
  }
  return { from: goal.startsOn, to: goal.deadline ?? today }
}

/** Progress from the number of distinct check-in days inside `goalWindow` (one row per habit and day). */
export function goalProgressFromCount(
  goal: Goal,
  current: number,
  today: LocalDate,
): { current: number; target: number; status: GoalStatus } {
  if (current >= goal.target) return { current, target: goal.target, status: 'done' }
  const overdue = goal.kind === 'total' && goal.deadline !== null && today > goal.deadline
  return { current, target: goal.target, status: overdue ? 'overdue' : 'in_progress' }
}

export function goalProgress(
  goal: Goal,
  dates: LocalDate[],
  today: LocalDate,
): { current: number; target: number; status: GoalStatus } {
  const { from, to } = goalWindow(goal, today)
  const current = [...new Set(dates)].filter((d) => d >= from && d <= to).length
  return goalProgressFromCount(goal, current, today)
}

export function validateGoal(
  input: { kind: 'weekly' | 'total'; target: number; deadline: LocalDate | null },
  today: LocalDate,
): { ok: true } | { ok: false; error: string } {
  if (input.kind !== 'weekly' && input.kind !== 'total') return { ok: false, error: 'Elige un tipo de meta.' }
  if (!Number.isInteger(input.target) || input.target < 1) {
    return { ok: false, error: 'La cantidad debe ser un número entero mayor a 0.' }
  }
  if (input.kind === 'weekly') {
    if (input.target > 7) return { ok: false, error: 'Una meta semanal puede ser de 1 a 7 días.' }
    if (input.deadline !== null) return { ok: false, error: 'Las metas semanales no tienen fecha límite.' }
    return { ok: true }
  }
  if (input.target > 100000) return { ok: false, error: 'La cantidad es demasiado grande.' }
  if (input.deadline !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deadline)) return { ok: false, error: 'La fecha límite no es válida.' }
    if (input.deadline < today) return { ok: false, error: 'La fecha límite ya pasó.' }
  }
  return { ok: true }
}
