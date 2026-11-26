import { periodsFor } from "./challenges";
import type { Frequency, LocalDate } from "./types";

export const PRACTICE_MAX_WEEKS = 4;

export type PracticeTerms = {
  startsOn: LocalDate;
  weeks: number;
  frequency: Frequency;
  fineAmount: number;
};

export type PracticeReport = {
  owed: number;
  finished: boolean;
  current: { index: number; total: number; done: number; needed: number; end: LocalDate } | null;
};

/** Closed periods that were missed add the fine. The open period never does. */
export function practiceReport(p: PracticeTerms, dates: readonly LocalDate[], today: LocalDate): PracticeReport {
  const periods = periodsFor(p.startsOn, p.weeks, p.frequency);
  const total = periods.length;
  let owed = 0;
  let current: PracticeReport["current"] = null;
  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    const needed = p.frequency.type === "daily" ? 1 : p.frequency.target;
    const done = new Set(dates.filter((d) => d >= period.start && d <= period.end)).size;
    if (today > period.end) {
      if (done < needed) owed += p.fineAmount;
    } else if (today >= period.start && today <= period.end) {
      current = { index: i + 1, total, done, needed, end: period.end };
    }
  }
  const last = periods[periods.length - 1];
  return { owed, finished: last ? today > last.end : true, current };
}

export function validatePracticeInput(input: {
  habitId: string;
  target: number;
  weeks: number;
  fineAmount: number;
}): { ok: true } | { ok: false; error: string } {
  if (!input.habitId) return { ok: false, error: "Elige un hábito." };
  if (!Number.isInteger(input.target) || input.target < 1 || input.target > 7) {
    return { ok: false, error: "Elige entre 1 y 7 días por semana." };
  }
  if (!Number.isInteger(input.weeks) || input.weeks < 1 || input.weeks > PRACTICE_MAX_WEEKS) {
    return { ok: false, error: "La práctica dura de 1 a 4 semanas." };
  }
  if (!Number.isInteger(input.fineAmount) || input.fineAmount < 1 || input.fineAmount > 10_000_000) {
    return { ok: false, error: "La multa debe ser un monto entero entre $1 y $10.000.000." };
  }
  return { ok: true };
}
