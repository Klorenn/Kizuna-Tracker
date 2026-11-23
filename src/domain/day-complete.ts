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

export type HoyRowState = { id: string; preset: string | null; hasItems: boolean; done: boolean };
export type HoyState = DayProgress & { rows: HoyRowState[] };

/** An item-based "Comer bien" habit went from open to done (all its meals checked). */
export function mealsJustCompleted(prev: HoyState, next: HoyState): boolean {
  return completedMealsHabit(prev, next) !== null;
}

/** Id of the item-based "Comer bien" habit that just got all its meals, if any. */
export function completedMealsHabit(prev: HoyState, next: HoyState): string | null {
  const row = next.rows.find(
    (r) =>
      r.preset === "eat_well" &&
      r.hasItems &&
      r.done &&
      prev.rows.some((p) => p.id === r.id && !p.done),
  );
  return row?.id ?? null;
}

/**
 * Which celebration to show after Hoy refreshed, never two at once.
 * Priority: gym sheet (lift, owned by the photo flow) > day complete (jump) > meals complete (eat).
 */
export function pickCelebration(
  prev: HoyState | null,
  next: HoyState,
  opts: { gymSheet?: boolean } = {},
): "day" | "meals" | null {
  if (opts.gymSheet || !prev) return null;
  if (shouldCelebrateDay(prev, next)) return "day";
  if (mealsJustCompleted(prev, next)) return "meals";
  return null;
}
