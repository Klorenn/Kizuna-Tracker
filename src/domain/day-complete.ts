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

/** `target` is a quantity habit's goal in ml (water only); absent when unknown or in another unit. */
export type HoyRowState = {
  id: string;
  preset: string | null;
  hasItems: boolean;
  done: boolean;
  icon?: string;
  target?: number;
  /** habit name, quantity unit (`QuantityUnit`) and custom unit label: only for the water detection of custom habits */
  name?: string;
  unit?: string;
  unitLabel?: string | null;
};

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

const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Water moment. Two ways in:
 * - the "Agua" preset (any log type);
 * - a custom habit (preset null: the form stores no preset for a habit the user named "Agua") that
 *   measures a liquid (unit ml, or a custom unit labelled vasos / litros / ml / l) AND is named agua.
 * Name alone or unit alone is not enough: "Leche" in ml or "Agua de coco" in steps never celebrate.
 */
export function isWaterHabit(r: { preset: string | null; name?: string; unit?: string; unitLabel?: string | null }): boolean {
  if (r.preset === "water") return true;
  if (!r.name || !r.unit) return false;
  const liquid = r.unit === "ml" || (r.unit === "custom" && /^(vasos?|litros?|ml|l)$/.test(norm((r.unitLabel ?? "").trim())));
  return liquid && /\bagua\b/.test(norm(r.name));
}

/** Celebration subtitle with the real daily goal in ml; generic when the target is unknown. */
export function waterGoalBody(targetMl: number | undefined): string {
  if (!targetMl || !Number.isFinite(targetMl) || targetMl <= 0) return "Bien hidratado hoy 💧";
  if (targetMl < 1000) return `${Math.round(targetMl)} ml hoy 💧`;
  const l = Math.round((targetMl / 1000) * 100) / 100;
  return `${String(l).replace(".", ",")} ${l === 1 ? "litro" : "litros"} hoy 💧`;
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

export type Celebration = "book" | "day" | "meals" | "rest" | "water" | "study" | "reading";

/**
 * Which celebration to show after Hoy refreshed, never two at once. Priority: gym sheet (lift,
 * owned by the photo flow: null here) > book finished (jump) > day complete (jump) > meals complete
 * (eat) > rest, "Dormir 8 h" (sleep) > water goal (jump) > study (code) > reading saved (read). `prev` null (first
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
  if (justDone(prev, next, isWaterHabit)) out.push("water");
  if (justDone(prev, next, isStudyHabit)) out.push("study");
  if (opts.reading) out.push("reading");
  return out;
}

/** The habit behind a rest, water or study celebration (scope of its once-per-day claim). */
export function celebratedHabit(kind: "rest" | "water" | "study", prev: HoyState, next: HoyState): string | null {
  return justDone(prev, next, kind === "rest" ? isRestHabit : kind === "water" ? isWaterHabit : isStudyHabit);
}
