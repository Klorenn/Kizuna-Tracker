import {
  celebrationCandidates,
  type Celebration,
  type HoyState,
  type ReadingSaved,
} from '@/domain/day-complete'

export type Shown = { kind: Celebration; reading: ReadingSaved | null }

export type WatchDeps = {
  /** A reading sheet is open: defer (see celebration-bus). */
  held(): boolean
  /** Takes what the reading sheet announced (celebration bus). */
  take(): ReadingSaved | null
  /** Once-per-session claim; false when this celebration already showed. */
  claim(kind: Celebration, before: HoyState, next: HoyState): boolean
}

const signature = (s: HoyState) =>
  JSON.stringify([s.done, s.total, s.rows.map((r) => [r.id, r.done, r.hasItems])])

/**
 * One evaluation of Hoy's celebration watcher, pure so its ordering is testable:
 * - held (a reading sheet is open): nothing is taken and `prev` stays, so the change is judged on
 *   release with the latest state;
 * - same state as before: wait, and leave the bus for the refresh that brings the change (the
 *   sheet may announce and close before the server refresh lands);
 * - first render: drop any stale announcement, never celebrate;
 * - otherwise the first candidate (priority order) that can still be claimed.
 */
export function watchStep(
  prev: HoyState | null,
  next: HoyState,
  deps: WatchDeps,
): { prev: HoyState | null; show: Shown | null; deferred: boolean } {
  if (deps.held()) return { prev, show: null, deferred: true }
  if (prev && signature(prev) === signature(next)) return { prev, show: null, deferred: false }
  const reading = deps.take()
  if (!prev) return { prev: next, show: null, deferred: false }
  for (const kind of celebrationCandidates(prev, next, { reading })) {
    if (deps.claim(kind, prev, next)) return { prev: next, show: { kind, reading }, deferred: false }
  }
  return { prev: next, show: null, deferred: false }
}
