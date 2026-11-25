import type { ReadingSaved } from '@/domain/day-complete'

export type { ReadingSaved }

/*
 * Client-only hand-off between the reading sheet and Hoy's celebration watcher. The sheet saves
 * (server action), announces what it saved and refreshes; the watcher takes it on the next server
 * refresh and lets pickCelebration decide which single sheet to open. `take` empties it.
 */
let pending: ReadingSaved | null = null

export function announceReading(r: ReadingSaved): void {
  pending = { ...r }
}

export function takeReading(): ReadingSaved | null {
  const r = pending
  pending = null
  return r
}

/** A failed save: nothing to celebrate for the reading. */
export function clearReading(): void {
  pending = null
}

/*
 * While a "¿Qué leíste hoy?" sheet is open, Hoy must not open a celebration on top of it (one sheet
 * at a time), even when a server refresh lands meanwhile (a save, or a partial failure that already
 * checked the habit in). The watcher defers and re-evaluates on the last release.
 */
let holds = 0
const listeners = new Set<() => void>()

/** Holds celebrations; call the returned function once to release (extra calls are no-ops). */
export function holdCelebrations(): () => void {
  holds++
  let released = false
  return () => {
    if (released) return
    released = true
    holds--
    if (holds === 0) for (const fn of [...listeners]) fn()
  }
}

export function celebrationsHeld(): boolean {
  return holds > 0
}

export function onCelebrationsReleased(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/*
 * A quantity habit's goal was met (the server confirmed it). Hoy normally notices through the refresh that
 * follows, but that refresh is a second round trip that can be skipped or land late (offline, a held sheet),
 * so the control also announces it here and the watcher celebrates from this when the refresh did not.
 */
let goal: string | null = null
const goalListeners = new Set<() => void>()

export function announceGoal(habitId: string): void {
  goal = habitId
  for (const fn of [...goalListeners]) fn()
}

export function takeGoal(): string | null {
  const g = goal
  goal = null
  return g
}

export function clearGoal(): void {
  goal = null
}

export function onGoalAnnounced(fn: () => void): () => void {
  goalListeners.add(fn)
  return () => {
    goalListeners.delete(fn)
  }
}
