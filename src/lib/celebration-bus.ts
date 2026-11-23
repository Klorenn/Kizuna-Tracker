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
