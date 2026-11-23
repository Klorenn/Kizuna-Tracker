import "server-only";
import { addDays } from "@/domain/dates";
import type { LocalDate } from "@/domain/types";
import { fetchAll } from "@/lib/paginate";
import { profileStreaks } from "@/lib/stats";
import type { createServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

/** The friends list only needs "is there a streak and how long": a short, bounded window. */
export const LIST_STREAK_DAYS = 120;
/** Friends whose streak is looked up on one load; the rest of the list simply has no status line. */
export const STREAK_FRIENDS_MAX = 30;

export type ListStreak = { value: number; unit: "days" | "weeks"; capped: boolean };

/**
 * Longest current streak per friend over the habits the viewer can see (RLS: accepted friends,
 * non-private habits), for at most the first STREAK_FRIENDS_MAX ids. A streak that fills the
 * window is `capped` (shown as "120+"). Throws on any read error: the caller shows no status
 * line rather than a false "Sin racha activa".
 */
export async function friendStreaks(
  supabase: Supabase,
  allIds: string[],
  today: LocalDate,
): Promise<Map<string, ListStreak>> {
  const out = new Map<string, ListStreak>();
  const ids = allIds.slice(0, STREAK_FRIENDS_MAX);
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
  const dates = new Map<string, LocalDate[]>();
  if (habits.length > 0) {
    // one row per habit with its dates in the window: no 1000-row cap to page past
    const { data, error } = await supabase.rpc("checkin_dates", {
      p_habit_ids: habits.map((h) => h.id),
      p_from: addDays(today, -LIST_STREAK_DAYS),
    });
    if (error) throw new Error(error.message);
    for (const c of data ?? []) dates.set(c.habit_id, c.dates);
  }
  for (const id of ids) {
    const mine = habits.filter((h) => h.user_id === id).map((h) => ({ ...h, dates: dates.get(h.id) ?? [] }));
    const { value, unit } = profileStreaks(mine, today).current;
    const full = unit === "weeks" ? Math.floor(LIST_STREAK_DAYS / 7) - 1 : LIST_STREAK_DAYS;
    out.set(id, { value, unit, capped: value >= full });
  }
  return out;
}
