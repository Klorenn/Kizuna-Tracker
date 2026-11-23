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

export type HoyRowState = { id: string; preset: string | null; hasItems: boolean; done: boolean; icon?: string };

/** Picker icons that mean study or desk work (the "Estudiar" preset uses book-open). */
export const STUDY_ICONS: readonly string[] = ["laptop", "desk"];

/** Rest moment: the "Dormir 8 h" preset (sleeping cat). */
export function isRestHabit(r: { preset: string | null; icon?: string }): boolean {
  return r.preset === "sleep";
}

/** Study or work moment: the "Estudiar" preset or a laptop/desk icon (typing cat). */
export function isStudyHabit(r: { preset: string | null; icon?: string }): boolean {
  return r.preset === "study" || (r.icon !== undefined && STUDY_ICONS.includes(r.icon));
}

/** Id of the first row matching `pred` that went from open to done. */
function justDone(prev: HoyState, next: HoyState, pred: (r: HoyRowState) => boolean): string | null {
  const row = next.rows.find((r) => r.done && pred(r) && prev.rows.some((p) => p.id === r.id && !p.done));
  return row?.id ?? null;
}
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

/** What a reading sheet saved from Hoy: pages read and the title of the book it finished, if any. */
export type ReadingSaved = { pages: number; finishedTitle: string | null };

export type Celebration = "book" | "day" | "meals" | "rest" | "study" | "reading";

/**
 * Which celebration to show after Hoy refreshed, never two at once. Priority: gym sheet (lift,
 * owned by the photo flow: null here) > book finished (jump) > day complete (jump) > meals complete
 * (eat) > rest, "Dormir 8 h" (sleep) > study (code) > reading saved (read). `prev` null (first
 * render) never celebrates.
 */
export function pickCelebration(
  prev: HoyState | null,
  next: HoyState,
  opts: { gymSheet?: boolean; reading?: ReadingSaved | null } = {},
): Celebration | null {
  return celebrationCandidates(prev, next, opts)[0] ?? null;
}

/**
 * Every celebration that applies, in priority order. Hoy shows the first one not yet claimed this
 * session, so an explicit reading save still celebrates when "día completo" was already shown.
 */
export function celebrationCandidates(
  prev: HoyState | null,
  next: HoyState,
  opts: { gymSheet?: boolean; reading?: ReadingSaved | null } = {},
): Celebration[] {
  if (opts.gymSheet || !prev) return [];
  const out: Celebration[] = [];
  if (opts.reading?.finishedTitle) out.push("book");
  if (shouldCelebrateDay(prev, next)) out.push("day");
  if (mealsJustCompleted(prev, next)) out.push("meals");
  if (justDone(prev, next, isRestHabit)) out.push("rest");
  if (justDone(prev, next, isStudyHabit)) out.push("study");
  if (opts.reading) out.push("reading");
  return out;
}

/** The habit behind a rest or study celebration (scope of its once-per-day claim). */
export function celebratedHabit(kind: "rest" | "study", prev: HoyState, next: HoyState): string | null {
  return justDone(prev, next, kind === "rest" ? isRestHabit : isStudyHabit);
}
