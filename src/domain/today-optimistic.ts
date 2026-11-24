import type { CheckinInput, HabitInput, ItemCheckInput, ItemInput } from './today'
import type { TodayLog } from './logs'
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
  /** today's logs by habit and today's quantity sums (the optimistic quantity and time reducers edit them) */
  todayLogs?: { logs: Record<string, TodayLog[]>; quantity: Record<string, QuantityEntry[]> }
}

type QuantityEntry = { id: string; amount: number; at: string }

const logsOf = (s: OptimisticState) => s.todayLogs ?? { logs: {}, quantity: {} }

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

/**
 * Adds one quantity sum. Idempotent by entry id. The check-in is NOT invented: "goal met" follows the server's
 * confirmed total, so `done` only changes when Hoy refetches after the RPC answers.
 */
export function applyQuantityEntry<T extends OptimisticState>(
  state: T,
  habitId: string,
  entryId: string,
  amount: number,
  at: string,
): T {
  const tl = logsOf(state)
  const current = tl.quantity[habitId] ?? []
  if (current.some((e) => e.id === entryId)) return state
  return { ...state, todayLogs: { ...tl, quantity: { ...tl.quantity, [habitId]: [...current, { id: entryId, amount, at }] } } }
}

/** Removes one of today's quantity sums by id; an unknown id leaves the state as it was. */
export function removeQuantityEntry<T extends OptimisticState>(state: T, entryId: string): T {
  const tl = logsOf(state)
  const habitId = Object.keys(tl.quantity).find((h) => tl.quantity[h].some((e) => e.id === entryId))
  if (!habitId) return state
  return {
    ...state,
    todayLogs: { ...tl, quantity: { ...tl.quantity, [habitId]: tl.quantity[habitId].filter((e) => e.id !== entryId) } },
  }
}

const timeLogOf = (logs: TodayLog[] | undefined) => (logs ?? []).find((l) => l.kind === 'time')

function withTime<T extends OptimisticState>(state: T, habitId: string, minutes: number, topic: string | null): T {
  const tl = logsOf(state)
  const others = (tl.logs[habitId] ?? []).filter((l) => l.kind !== 'time')
  return { ...state, todayLogs: { ...tl, logs: { ...tl.logs, [habitId]: [...others, { kind: 'time', minutes, topic }] } } }
}

/** `add_time` / a Pomodoro block: adds minutes to today (a new topic replaces the old) and checks the habit in. */
export function applyTime<T extends OptimisticState>(
  state: T,
  habitId: string,
  minutes: number,
  topic: string | null,
  checkinId: string,
): T {
  const existing = timeLogOf(logsOf(state).logs[habitId])
  const base = existing && existing.kind === 'time' ? existing : null
  const next = withTime(state, habitId, (base?.minutes ?? 0) + minutes, topic ?? base?.topic ?? null)
  return applyCheckin(next, habitId, checkinId)
}

/** `set_time_entry`: replaces today's total and topic (no topic clears it). The check-in is untouched. */
export function setTimeLog<T extends OptimisticState>(state: T, habitId: string, minutes: number, topic: string | null): T {
  return withTime(state, habitId, minutes, topic)
}

/** `delete_time_entry`: drops today's minutes and leaves the check-in, as the RPC does. */
export function removeTimeLog<T extends OptimisticState>(state: T, habitId: string): T {
  const tl = logsOf(state)
  return { ...state, todayLogs: { ...tl, logs: { ...tl.logs, [habitId]: (tl.logs[habitId] ?? []).filter((l) => l.kind !== 'time') } } }
}
