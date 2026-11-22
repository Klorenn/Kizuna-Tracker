"use server";

import { localDate, weekStart } from "@/domain/dates";
import { dailyStreak, weeklyStreak } from "@/domain/streaks";
import { createServerClient } from "@/lib/supabase/server";

export type StreakInfo =
  | { ok: true; streak: number; unit: "día" | "días" | "semana" | "semanas"; weekly: { count: number; target: number } | null }
  | { ok: false; error: string };

/** Current streak of one of the caller's habits (after a check-in), for the celebration. */
export async function habitStreak(habitId: string): Promise<StreakInfo> {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Inicia sesión para continuar." };
  const { data: profile } = await supabase.from("profiles").select("timezone").single();
  const { data: habit } = await supabase
    .from("habits")
    .select("frequency_type,target_per_week")
    .eq("id", habitId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!profile || !habit) return { ok: false, error: "No encontramos ese hábito." };
  const { data: rows } = await supabase
    .from("checkins")
    .select("local_date")
    .eq("habit_id", habitId)
    .is("rejected_at", null);
  const dates = (rows ?? []).map((r) => r.local_date);
  const today = localDate(new Date(), profile.timezone);
  if (habit.frequency_type === "weekly") {
    const target = habit.target_per_week ?? 1;
    const streak = weeklyStreak(dates, target, today);
    const from = weekStart(today);
    const count = new Set(dates.filter((d) => d >= from && d <= today)).size;
    return { ok: true, streak, unit: streak === 1 ? "semana" : "semanas", weekly: { count, target } };
  }
  const streak = dailyStreak(dates, today);
  return { ok: true, streak, unit: streak === 1 ? "día" : "días", weekly: null };
}
