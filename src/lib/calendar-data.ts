import { monthBounds, type MonthKey } from "@/domain/calendar";
import { addDays, localDate } from "@/domain/dates";
import type { LocalDate } from "@/domain/types";
import { buildDaySummaries, type HabitDay } from "@/lib/calendar-days";
import { loadMonthLogs, loadWeights, quantityConfigOf, type QuantityColumns } from "@/lib/logs-data";
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
    habits: ({ id: string; created_at: string; log_type?: string } & QuantityColumns)[];
    month: MonthKey;
    today: LocalDate;
    timezone: string;
    /**
     * Attach the reading / workout detail of each check-in. Off by default: the detail is the
     * owner's, so only the owner's own views (Resumen, habit detail) pass `true`; a view of
     * someone else's calendar must never do.
     */
    includeLogs?: boolean;
  },
): Promise<Record<LocalDate, HabitDay[]>> {
  const { userId, habits, month, today, timezone, includeLogs = false } = opts;
  if (habits.length === 0) return {};
  const ids = habits.map((h) => h.id);
  const { first, last } = monthBounds(month);
  const until = last < today ? last : today;
  if (until < first) return {};

  // The detail of every kind is the owner's: nothing below is read without `includeLogs`.
  const quantityHabits = includeLogs
    ? habits.flatMap((h) => {
        const config = h.log_type === "quantity" ? quantityConfigOf(h) : null;
        return config ? [{ id: h.id, config }] : [];
      })
    : [];
  const kinds = {
    reading: includeLogs && habits.some((h) => h.log_type === "reading"),
    workout: includeLogs && habits.some((h) => h.log_type === "workout"),
    time: includeLogs && habits.some((h) => h.log_type === "time"),
    watch: includeLogs && habits.some((h) => h.log_type === "watch"),
    cardio: includeLogs && habits.some((h) => h.log_type === "cardio"),
    quantity: quantityHabits.length > 0 ? { habits: quantityHabits, timezone } : undefined,
  };
  const anyLogs = kinds.reading || kinds.workout || kinds.time || kinds.watch || kinds.cardio || kinds.quantity !== undefined;
  const [checkins, checkinItems, items, logs] = await Promise.all([
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
    anyLogs ? loadMonthLogs(supabase, userId, { first, until }, kinds) : Promise.resolve(undefined),
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
    logs: logs?.byCheckin,
    quantityByHabitDay: logs?.quantityByHabitDay,
  });
}

/**
 * The owner's weigh-ins of one month by date (private: only for the user's own calendar,
 * read with their session). Never call this for anyone else's view.
 */
export async function loadMonthWeights(
  supabase: Supabase,
  userId: string,
  month: MonthKey,
): Promise<Record<LocalDate, number>> {
  const { first, last } = monthBounds(month);
  const entries = await loadWeights(supabase, userId, first, last);
  return Object.fromEntries(entries.map((e) => [e.date, e.kg]));
}
