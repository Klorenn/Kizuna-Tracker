import type { GoalView } from "@/components/GoalCard";
import { goalProgressFromCount, goalWindow, type Goal } from "@/domain/goals";
import { toHabitColor } from "@/domain/habit-colors";
import { loadCheckinDates } from "@/lib/checkin-dates";
import type { createServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const shortDate = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

export type GoalsResult = { ok: boolean; goals: GoalView[] };

/**
 * Same goals as `loadGoals`, plus whether every read worked. `ok: false` means the goals or their
 * check-in history could not be read: `goals` then holds whatever could be built (progress 0 when
 * the history failed, nothing when the goals failed) and the screen must show a retry state
 * instead of presenting it as real.
 */
export async function loadGoalsResult(
  supabase: Supabase,
  userId: string,
  todayInput: string | Promise<string>,
  habitId?: string,
): Promise<GoalsResult> {
  // `today` may still be in flight (it comes from the profile's time zone): the goals select does not need it,
  // so it starts now and the date is awaited only when the windows are built
  const todayRead = Promise.resolve(todayInput);
  todayRead.catch(() => {}); // awaited below on the success path; this only keeps an early return from leaving it unhandled
  let q = supabase
    .from("goals")
    // the habit comes in the same read (goals on archived habits are hidden): one level, not two
    .select("id,habit_id,kind,target,starts_on,deadline,created_at,habits!inner(name,color)")
    .eq("user_id", userId)
    .is("archived_at", null)
    .is("habits.archived_at", null)
    .order("created_at");
  if (habitId) q = q.eq("habit_id", habitId);
  const { data: rows, error } = await q;
  if (error) return { ok: false, goals: [] };
  const goals = rows ?? [];
  if (goals.length === 0) return { ok: true, goals: [] };
  const today = await todayRead;

  // One history read for every goal (one row per habit, no row cap), then each goal counts its own window.
  const visible = goals.map((g) => {
    const goal: Goal =
      g.kind === "weekly"
        ? { id: g.id, habitId: g.habit_id, kind: "weekly", target: g.target }
        : { id: g.id, habitId: g.habit_id, kind: "total", target: g.target, startsOn: g.starts_on, deadline: g.deadline };
    return { g, goal, name: g.habits.name, color: toHabitColor(g.habits.color), window: goalWindow(goal, today) };
  });
  const history = await loadCheckinDates(
    supabase,
    visible.map((v) => v.g.habit_id),
    visible.reduce((min, v) => (v.window.from < min ? v.window.from : min), visible[0].window.from),
  );
  // a failed history is reported in `ok`; the goals still render with 0 so the retry state has a shape
  const datesByHabit = history.ok ? history.byHabit : new Map<string, string[]>();

  const views: GoalView[] = visible.map(({ g, goal, name, color, window }): GoalView => {
    // One row per habit and day: the count of dates inside the goal window.
    const count = (datesByHabit.get(g.habit_id) ?? []).filter((d) => d >= window.from && d <= window.to).length;
    const p = goalProgressFromCount(goal, count, today);
    if (g.kind === "weekly") {
      return { id: g.id, title: name, kind: "weekly", ...p, color, progressLabel: `${p.current} de ${p.target}` };
    }
    const parts = [`${p.current} de ${p.target}`];
    if (p.current < p.target) parts.push(`faltan ${p.target - p.current}`);
    parts.push(g.deadline ? `hasta el ${shortDate(g.deadline)}` : "sin fecha límite");
    return { id: g.id, title: `${g.target} · ${name}`, kind: "total", ...p, color, detail: parts.join(" · ") };
  });
  return { ok: history.ok, goals: views.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "weekly" ? -1 : 1)) };
}

/**
 * The user's active goals as view models (weekly first), optionally limited to one habit. Kept for
 * screens that have not adopted `loadGoalsResult`: a failed read shows as zero progress there.
 */
export async function loadGoals(supabase: Supabase, userId: string, today: string | Promise<string>, habitId?: string) {
  return (await loadGoalsResult(supabase, userId, today, habitId)).goals;
}
