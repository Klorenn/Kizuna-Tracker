import type { CheckinInput, HabitInput, ItemCheckInput, ItemInput } from './today'
import type { LocalDate } from './types'

/**
 * The raw inputs `buildToday` derives Hoy from. The optimistic reducers edit these (never the rows),
 * so the optimistic state and the server state go through the same math.
 */
export type OptimisticState = {
  today: LocalDate
  habits: HabitInput[]
  items: ItemInput[]
  itemChecks: ItemCheckInput[]
  todayCheckins: { id: string; habit_id: string }[]
  checkins: CheckinInput[]
}

const doneToday = (s: OptimisticState, habitId: string) =>
  s.todayCheckins.some((c) => c.habit_id === habitId) ||
  s.checkins.some((c) => c.habit_id === habitId && c.local_date === s.today)

/** A boolean check-in (or a day completed by its last step). Idempotent: a habit already done today is unchanged. */
export function applyCheckin<T extends OptimisticState>(state: T, habitId: string, checkinId: string): T {
  if (doneToday(state, habitId)) return state
  return {
    ...state,
    todayCheckins: [...state.todayCheckins, { id: checkinId, habit_id: habitId }],
    checkins: [...state.checkins, { habit_id: habitId, local_date: state.today }],
  }
}

/** Undo: drops today's check-in of the habit from both the id list and the history. */
export function removeCheckin<T extends OptimisticState>(state: T, habitId: string): T {
  return {
    ...state,
    todayCheckins: state.todayCheckins.filter((c) => c.habit_id !== habitId),
    checkins: state.checkins.filter((c) => !(c.habit_id === habitId && c.local_date === state.today)),
  }
}

/**
 * Checks a step. The day completes (a check-in appears) when it was the last unchecked step of its
 * habit, as `check_item` does on the server. `dayCheckinId` names that optimistic check-in.
 */
export function applyItem<T extends OptimisticState>(
  state: T,
  itemId: string,
  createdAt: string,
  dayCheckinId: string = `optimistic-${itemId}`,
): T {
  const item = state.items.find((i) => i.id === itemId)
  if (!item) return state
  if (state.itemChecks.some((c) => c.item_id === itemId && c.local_date === state.today)) return state
  const withCheck: T = {
    ...state,
    itemChecks: [...state.itemChecks, { item_id: itemId, local_date: state.today, created_at: createdAt }],
  }
  const siblings = state.items.filter((i) => i.habit_id === item.habit_id)
  const allChecked = siblings.every((i) =>
    withCheck.itemChecks.some((c) => c.item_id === i.id && c.local_date === state.today),
  )
  return allChecked ? applyCheckin(withCheck, item.habit_id, dayCheckinId) : withCheck
}

/** Unchecks a step; like `uncheck_item`, it also removes the habit's check-in of today. */
export function removeItem<T extends OptimisticState>(state: T, itemId: string): T {
  const item = state.items.find((i) => i.id === itemId)
  if (!item) return state
  const without: T = {
    ...state,
    itemChecks: state.itemChecks.filter((c) => !(c.item_id === itemId && c.local_date === state.today)),
  }
  return removeCheckin(without, item.habit_id)
}
