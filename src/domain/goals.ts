import { addDays, weekStart } from './dates'
import type { LocalDate } from './types'

export type Goal =
  | { id: string; habitId: string; kind: 'weekly'; target: number }
  | { id: string; habitId: string; kind: 'total'; target: number; startsOn: LocalDate; deadline: LocalDate | null }

export type GoalStatus = 'in_progress' | 'done' | 'overdue'

export function goalProgress(
  goal: Goal,
  dates: LocalDate[],
  today: LocalDate,
): { current: number; target: number; status: GoalStatus } {
  const unique = new Set(dates)
  if (goal.kind === 'weekly') {
    const from = weekStart(today)
    const to = addDays(from, 6)
    const current = [...unique].filter((d) => d >= from && d <= to).length
    return { current, target: goal.target, status: current >= goal.target ? 'done' : 'in_progress' }
  }
  const current = [...unique].filter(
    (d) => d >= goal.startsOn && (goal.deadline === null || d <= goal.deadline),
  ).length
  if (current >= goal.target) return { current, target: goal.target, status: 'done' }
  const overdue = goal.deadline !== null && today > goal.deadline
  return { current, target: goal.target, status: overdue ? 'overdue' : 'in_progress' }
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
