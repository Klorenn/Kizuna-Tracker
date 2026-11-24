import { parseMonthParam, type MonthKey } from "@/domain/calendar";

/**
 * The month a page will most likely show, known before the first check-in is: the requested month
 * when it is valid and not in the future, else the current one. Only the lower clamp (the first
 * check-in) is missing, and it only matters for a month typed by hand.
 */
export function monthGuess(raw: string | string[] | undefined | null, current: MonthKey): MonthKey {
  return parseMonthParam(raw, { current, earliest: "0000-00" });
}

/**
 * Starts `load(guess)` now. `forMonth(final)` returns that read when the final month is the guess,
 * and loads the right month otherwise. A discarded guess that failed is swallowed: it was never shown.
 */
export function prefetchMonth<T>(guess: MonthKey, load: (month: MonthKey) => Promise<T>) {
  const started = load(guess);
  started.catch(() => {});
  return { forMonth: (final: MonthKey): Promise<T> => (final === guess ? started : load(final)) };
}
