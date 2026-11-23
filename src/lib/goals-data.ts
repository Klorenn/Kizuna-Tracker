import type { GoalView } from "@/components/GoalCard";
import { goalProgressFromCount, goalWindow, type Goal } from "@/domain/goals";
import { toHabitColor } from "@/domain/habit-colors";
import type { createServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const shortDate = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/** The user's active goals as view models (weekly first), optionally limited to one habit. */
export async function loadGoals(supabase: Supabase, userId: string, today: string, habitId?: string) {
  let q = supabase
    .from("goals")
    // the habit comes in the same read (goals on archived habits are hidden): one level, not two
    .select("id,habit_id,kind,target,starts_on,deadline,created_at,habits!inner(name,color)")
    .eq("user_id", userId)
    .is("archived_at", null)
    .is("habits.archived_at", null)
    .order("created_at");
  if (habitId) q = q.eq("habit_id", habitId);
  const { data: rows } = await q;
  const goals = rows ?? [];
  if (goals.length === 0) return [] as GoalView[];

  // One history read for every goal (one row per habit, no row cap), then each goal counts its own window.
  const visible = goals.map((g) => {
    const goal: Goal =
      g.kind === "weekly"
        ? { id: g.id, habitId: g.habit_id, kind: "weekly", target: g.target }
        : { id: g.id, habitId: g.habit_id, kind: "total", target: g.target, startsOn: g.starts_on, deadline: g.deadline };
    return { g, goal, name: g.habits.name, color: toHabitColor(g.habits.color), window: goalWindow(goal, today) };
  });
  // a failed read counts as no check-ins, as the per-goal counts did (this module never throws)
  const { data: history } = await supabase.rpc("checkin_dates", {
    p_habit_ids: [...new Set(visible.map((v) => v.g.habit_id))],
    p_from: visible.reduce((min, v) => (v.window.from < min ? v.window.from : min), visible[0].window.from),
  });
  const datesByHabit = new Map((history ?? []).map((r) => [r.habit_id, r.dates]));

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
  return views.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "weekly" ? -1 : 1));
}
