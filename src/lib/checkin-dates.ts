import { addDays, localDate } from "@/domain/dates";
import type { createServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

/** Habit ids per `checkin_dates` call: the database refuses more than 500, and one row per habit stays under the API row cap. */
export const DATES_CHUNK = 500;

export type DatesResult = { ok: true; byHabit: Map<string, string[]> } | { ok: false };

/**
 * Non-rejected check-in dates per habit since `from`, through the viewer's own session (RLS decides
 * what is visible). Large id lists go out in chunks, in parallel. Any failed chunk fails the whole
 * read: callers show a retry state, never a partial list that would pass for "no check-ins".
 */
export async function loadCheckinDates(supabase: Supabase, habitIds: string[], from: string): Promise<DatesResult> {
  const byHabit = new Map<string, string[]>();
  const ids = [...new Set(habitIds)];
  if (ids.length === 0) return { ok: true, byHabit };
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += DATES_CHUNK) chunks.push(ids.slice(i, i + DATES_CHUNK));
  const results = await Promise.all(chunks.map((p_habit_ids) => supabase.rpc("checkin_dates", { p_habit_ids, p_from: from })));
  for (const r of results) {
    if (r.error) return { ok: false };
    for (const row of r.data ?? []) byHabit.set(row.habit_id, row.dates);
  }
  return { ok: true, byHabit };
}

/**
 * A date that is never later than local today minus `days` in any time zone (local dates are within
 * a day of the UTC date), so the history read can start before the profile's zone is known. Drop what
 * is older than the exact window with `clipDates`.
 */
export function zoneFreeFrom(now: Date, days: number): string {
  return addDays(localDate(now, "UTC"), -(days + 1));
}

/** Keeps only the dates on or after `from`, per habit (same map shape, so results match an exact-window read). */
export function clipDates(byHabit: Map<string, string[]>, from: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [id, dates] of byHabit) out.set(id, dates.filter((d) => d >= from));
  return out;
}
