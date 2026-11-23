export type DayProgress = { done: number; total: number };

/**
 * True when the day has just reached 100% (last pending habit completed) and no other
 * celebration owns the moment. `prev` is null on first render: opening Hoy at 100% never
 * celebrates. `gymSheet` is true when a gym check-in's own sheet is showing: only that one shows.
 */
export function shouldCelebrateDay(
  prev: DayProgress | null,
  next: DayProgress,
  opts: { gymSheet?: boolean } = {},
): boolean {
  if (opts.gymSheet || !prev) return false;
  return next.total > 0 && prev.total === next.total && prev.done < prev.total && next.done === next.total;
}
