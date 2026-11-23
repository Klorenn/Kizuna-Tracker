import { monthBounds, type MonthKey } from "@/domain/calendar";
import { addDays, localDate } from "@/domain/dates";
import type { LocalDate } from "@/domain/types";
import { buildDaySummaries, type HabitDay } from "@/lib/calendar-days";
import { fetchAll } from "@/lib/paginate";
import type { createServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

/** Local date of the user's first check-in among these habits (rejected ones included). */
export async function loadFirstCheckinDate(
  supabase: Supabase,
  userId: string,
  habitIds: string[],
): Promise<LocalDate | null> {
  if (habitIds.length === 0) return null;
  const { data } = await supabase
    .from("checkins")
    .select("local_date")
    .eq("user_id", userId)
    .in("habit_id", habitIds)
    .order("local_date", { ascending: true })
    .limit(1);
  return data?.[0]?.local_date ?? null;
}

/**
 * Everything the calendar shows for one month, read through the user's session (RLS) and
 * bounded to that month's local dates (up to today). Each query is paged, so many habits or
 * items never hit the 1000-row API cap.
 */
export async function loadMonthDays(
  supabase: Supabase,
  opts: {
    userId: string;
    habits: { id: string; created_at: string }[];
    month: MonthKey;
    today: LocalDate;
    timezone: string;
  },
): Promise<Record<LocalDate, HabitDay[]>> {
  const { userId, habits, month, today, timezone } = opts;
  if (habits.length === 0) return {};
  const ids = habits.map((h) => h.id);
  const { first, last } = monthBounds(month);
  const until = last < today ? last : today;
  if (until < first) return {};

  const [checkins, checkinItems, items] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("checkins")
        .select("id,habit_id,local_date,created_at,photo_path,rejected_at,reject_reason")
        .eq("user_id", userId)
        .in("habit_id", ids)
        .gte("local_date", first)
        .lte("local_date", until)
        .order("local_date")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("checkin_items")
        .select("id,item_id,habit_id,local_date,created_at,photo_path")
        .eq("user_id", userId)
        .in("habit_id", ids)
        .gte("local_date", first)
        .lte("local_date", until)
        .order("local_date")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("habit_items")
        .select("id,habit_id,label,position,created_at,archived_at")
        .eq("user_id", userId)
        .in("habit_id", ids)
        .order("position")
        .order("id")
        .range(from, to),
    ),
  ]);

  const dates: LocalDate[] = [];
  for (let d = first; d <= until; d = addDays(d, 1)) dates.push(d);
  const local = (iso: string) => localDate(new Date(iso), timezone);

  return buildDaySummaries({
    habits: habits.map((h) => ({
      id: h.id,
      since: local(h.created_at),
      items: items
        .filter((i) => i.habit_id === h.id)
        .map((i) => ({
          id: i.id,
          label: i.label,
          position: i.position,
          since: local(i.created_at),
          until: i.archived_at ? local(i.archived_at) : null,
        })),
    })),
    checkins,
    checkinItems,
    dates,
    today,
    timezone,
  });
}
