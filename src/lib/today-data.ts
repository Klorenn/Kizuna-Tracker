import { addDays } from "@/domain/dates";
import type { CheckinInput } from "@/domain/today";
import { loadCheckinDates } from "@/lib/checkin-dates";
import { loadPickerBooks, type PickerBook } from "@/lib/reading-books";
import type { createServerClient } from "@/lib/supabase/server";
import { loadTodayLogs } from "@/lib/today-logs";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

/** How far back Hoy looks for streaks. */
export const HISTORY_DAYS = 400;

export type TodayHistory = { ok: true; checkins: CheckinInput[] } | { ok: false };

/**
 * Everything Hoy reads, in one round: the independent reads start together, and the two that need
 * the habit ids (the check-in history and the reading sheet's books) start the moment the habits
 * arrive, side by side. The history is one `checkin_dates` call (one row per habit, no row cap);
 * streak math stays in `domain/streaks`. A failed history is `{ ok: false }`, never an empty list.
 * The series and movie titles are not here: the watch sheet loads them when it opens.
 */
export async function loadTodayData(supabase: Supabase, userId: string, today: string) {
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
  const historyRead: Promise<TodayHistory> = habitsRead.then(async ({ data }) => {
    const dated = await loadCheckinDates(
      supabase,
      (data ?? []).map((h) => h.id),
      addDays(today, -HISTORY_DAYS),
    );
    if (!dated.ok) return { ok: false };
    const checkins: CheckinInput[] = [];
    for (const [habit_id, dates] of dated.byHabit) for (const local_date of dates) checkins.push({ habit_id, local_date });
    return { ok: true, checkins };
  });
  // the reading sheet's books, only when a reading habit is on Hoy
  const booksRead: Promise<PickerBook[]> = habitsRead.then(({ data }) =>
    (data ?? []).some((h) => h.log_type === "reading") ? loadPickerBooks(supabase, userId) : [],
  );

  const [habits, items, itemChecks, todayCheckins, todayLogs, history, books] = await Promise.all([
    habitsRead,
    supabase
      .from("habit_items")
      .select("id,habit_id,label,position,requires_photo")
      .eq("user_id", userId)
      .is("archived_at", null),
    supabase.from("checkin_items").select("item_id,local_date,created_at").eq("user_id", userId).eq("local_date", today),
    supabase.from("checkins").select("id,habit_id").eq("user_id", userId).eq("local_date", today),
    loadTodayLogs(supabase, userId, today),
    historyRead,
    booksRead,
  ]);
  return { habits, items, itemChecks, todayCheckins, todayLogs, history, books };
}
