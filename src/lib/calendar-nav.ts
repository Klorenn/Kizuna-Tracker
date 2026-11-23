import type { MonthKey } from '@/domain/calendar'

export type NavDir = 'next' | 'prev'

/** Minimum horizontal travel (px) of a swipe that changes the month. */
export const SWIPE_MIN = 56

/** A later month slides in from the right ("next"), an earlier one from the left. */
export function navDir(from: MonthKey, to: MonthKey): NavDir {
  return to > from ? 'next' : 'prev'
}

const horizontal = (dx: number, dy: number) => Math.abs(dx) > Math.abs(dy) * 1.5

/** The finger moved enough, and mostly sideways, for the grid to follow it. */
export function swipeStarted(dx: number, dy: number): boolean {
  return Math.abs(dx) >= 10 && horizontal(dx, dy)
}

/** Which month a finished gesture goes to: left swipe = next, right swipe = previous. */
export function swipeDirection(g: { dx: number; dy: number; cancelled: boolean }): NavDir | null {
  if (g.cancelled || Math.abs(g.dx) < SWIPE_MIN || !horizontal(g.dx, g.dy)) return null
  return g.dx < 0 ? 'next' : 'prev'
}
