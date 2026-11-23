import { addDays, localDate } from "@/domain/dates";
import { groupChipsByHabit } from "@/domain/group-habits";
import type { CheckinInput, HabitInput, ItemCheckInput, ItemInput } from "@/domain/today";
import { loadCheckinDates } from "@/lib/checkin-dates";
import { loadMyGroups } from "@/lib/groups-data";
import { loadPickerBooksOrNull, type PickerBook } from "@/lib/reading-books";
import type { createServerClient } from "@/lib/supabase/server";
import { loadTodayLogs, type TodayLogsResult } from "@/lib/today-logs";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

/** How far back Hoy looks for streaks. */
export const HISTORY_DAYS = 400;

export type TodayData =
  | {
      ok: true;
      today: string;
      timeZone: string;
      habits: HabitInput[];
      items: ItemInput[];
      itemChecks: ItemCheckInput[];
      todayCheckins: { id: string; habit_id: string }[];
      todayLogs: Extract<TodayLogsResult, { ok: true }>;
      checkins: CheckinInput[];
      books: PickerBook[];
      /** Habit id to the live group it is linked to. Decoration: empty when that read failed. */
      groupChips: Map<string, { name: string; color: string }>;
    }
  /** `missingProfile`: the signed-in user has no profile row (the page redirects); otherwise a read failed. */
  | { ok: false; missingProfile?: boolean };

/**
 * Everything Hoy reads, in as few serial levels as the data allows. Besides the session check
 * (the caller's), there are two: the profile, the habits, the habit items and the history RPC
 * start together (the RPC the moment the habits arrive), and the reads that need today's local
 * date (item checks, today's check-ins, today's logs) start when the profile arrives.
 *
 * The RPC cannot wait for the time zone, so it asks from a zone-free date: the UTC date minus 401
 * days is never later than local today minus 400 in any zone (local dates are within a day of UTC
 * dates), and the dates before today minus 400 are dropped here, so the window is exact.
 * Streak math stays in `domain/streaks`. Any failed read is `{ ok: false }`, never a partial Hoy.
 * The series and movie titles are not here: the watch sheet loads them when it opens.
 */
export async function loadTodayData(
  supabase: Supabase,
  userId: string,
  profileRead: Promise<{ timezone: string } | null>,
  now: Date = new Date(),
): Promise<TodayData> {
  const habitsRead = Promise.resolve(
    supabase
      .from("habits")
      .select(
        "id,name,icon,color,visibility,requires_photo,frequency_type,target_per_week,preset,log_type,quantity_unit,quantity_label,quantity_target,quantity_step,quantity_display,glass_ml",
      )
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("created_at"),
  );
  const itemsRead = Promise.resolve(
    supabase
      .from("habit_items")
      .select("id,habit_id,label,position,requires_photo")
      .eq("user_id", userId)
      .is("archived_at", null),
  );
  const rawHistory: Promise<{ ok: true; byHabit: Map<string, string[]> } | { ok: false }> = habitsRead.then(
    async ({ data, error }) => {
      if (error) return { ok: false };
      return loadCheckinDates(
        supabase,
        (data ?? []).map((h) => h.id),
        addDays(localDate(now, "UTC"), -(HISTORY_DAYS + 1)),
      );
    },
  );
  // the reading sheet's books, only when a reading habit is on Hoy
  const booksRead: Promise<PickerBook[] | null> = habitsRead.then(({ data, error }) =>
    error ? null : (data ?? []).some((h) => h.log_type === "reading") ? loadPickerBooksOrNull(supabase, userId) : [],
  );
  // the group chips are decoration: a failed or odd answer is "no chips", never a failed Hoy
  const chipsRead: Promise<Map<string, { name: string; color: string }>> = loadMyGroups(supabase).then(
    (r) => (r.ok ? groupChipsByHabit(r.data) : new Map()),
    () => new Map(),
  );
  // everything that needs today's local date
  const dayReads = profileRead.then(async (profile) => {
    if (!profile) return null;
    const today = localDate(now, profile.timezone);
    const [itemChecks, todayCheckins, todayLogs] = await Promise.all([
      supabase.from("checkin_items").select("item_id,local_date,created_at").eq("user_id", userId).eq("local_date", today),
      supabase.from("checkins").select("id,habit_id").eq("user_id", userId).eq("local_date", today),
      loadTodayLogs(supabase, userId, today),
    ]);
    return { today, timeZone: profile.timezone, itemChecks, todayCheckins, todayLogs };
  });

  const [habits, items, day, raw, books, groupChips] = await Promise.all([
    habitsRead,
    itemsRead,
    dayReads,
    rawHistory,
    booksRead,
    chipsRead,
  ]);
  if (!day) return { ok: false, missingProfile: true };
  if (habits.error || items.error || day.itemChecks.error || day.todayCheckins.error || !day.todayLogs.ok || !raw.ok || books === null) {
    // any failed read makes the whole screen a retry state: rows built from partial data would lie
    return { ok: false };
  }
  const from = addDays(day.today, -HISTORY_DAYS);
  const checkins: CheckinInput[] = [];
  for (const [habit_id, dates] of raw.byHabit) {
    for (const local_date of dates) if (local_date >= from) checkins.push({ habit_id, local_date });
  }
  return {
    ok: true,
    today: day.today,
    timeZone: day.timeZone,
    habits: habits.data ?? [],
    items: items.data ?? [],
    itemChecks: day.itemChecks.data ?? [],
    todayCheckins: day.todayCheckins.data ?? [],
    todayLogs: day.todayLogs,
    checkins,
    books,
    groupChips,
  };
}
