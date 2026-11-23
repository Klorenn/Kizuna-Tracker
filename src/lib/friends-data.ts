import "server-only";
import { addDays } from "@/domain/dates";
import type { LocalDate } from "@/domain/types";
import { fetchAll } from "@/lib/paginate";
import { profileStreaks } from "@/lib/stats";
import type { createServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

/** The friends list only needs "is there a streak and how long": a short, bounded window. */
export const LIST_STREAK_DAYS = 120;

/**
 * Longest current streak per friend over the habits the viewer can see (RLS: accepted friends,
 * non-private habits). Streaks longer than the window show as the window length.
 */
export async function friendStreaks(
  supabase: Supabase,
  ids: string[],
  today: LocalDate,
): Promise<Map<string, { value: number; unit: "days" | "weeks" }>> {
  const out = new Map<string, { value: number; unit: "days" | "weeks" }>();
  if (ids.length === 0) return out;
  const habits = await fetchAll((a, b) =>
    supabase
      .from("habits")
      .select("id,user_id,frequency_type,target_per_week")
      .in("user_id", ids)
      .neq("visibility", "private")
      .is("archived_at", null)
      .order("id")
      .range(a, b),
  );
  if (habits.length === 0) return out;
  const checkins = await fetchAll((a, b) =>
    supabase
      .from("checkins")
      .select("id,habit_id,local_date")
      .in("habit_id", habits.map((h) => h.id))
      .is("rejected_at", null)
      .gte("local_date", addDays(today, -LIST_STREAK_DAYS))
      .order("local_date")
      .order("id")
      .range(a, b),
  );
  const dates = new Map<string, LocalDate[]>();
  for (const c of checkins) dates.set(c.habit_id, [...(dates.get(c.habit_id) ?? []), c.local_date]);
  for (const id of ids) {
    const mine = habits.filter((h) => h.user_id === id).map((h) => ({ ...h, dates: dates.get(h.id) ?? [] }));
    out.set(id, profileStreaks(mine, today).current);
  }
  return out;
}
