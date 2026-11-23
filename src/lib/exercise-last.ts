import type { WorkoutSet } from "@/domain/logs";
import type { LocalDate } from "@/domain/types";

/**
 * Series of one exercise in its last session of `date`. Two workout habits can log the same
 * day, so the sets of just one session (the last loaded) are returned, never a merge of both.
 */
export function lastSessionSets(
  sets: WorkoutSet[],
  exerciseId: string,
  date: LocalDate,
): { reps: number; kg: number }[] {
  const day = sets.filter((s) => s.exerciseId === exerciseId && s.date === date);
  const last = day[day.length - 1];
  if (!last) return [];
  return day.filter((s) => s.sessionId === last.sessionId).map((s) => ({ reps: s.reps, kg: s.kg }));
}
