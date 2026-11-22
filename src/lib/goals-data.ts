import type { GoalView } from "@/components/GoalCard";
import { goalProgress, type Goal } from "@/domain/goals";
import type { createServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const shortDate = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/** The user's active goals as view models (weekly first), optionally limited to one habit. */
export async function loadGoals(supabase: Supabase, userId: string, today: string, habitId?: string) {
  let q = supabase
    .from("goals")
    .select("id,habit_id,kind,target,starts_on,deadline,created_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at");
  if (habitId) q = q.eq("habit_id", habitId);
  const { data: rows } = await q;
  const goals = rows ?? [];
  if (goals.length === 0) return [] as GoalView[];

  const habitIds = [...new Set(goals.map((g) => g.habit_id))];
  const [{ data: habits }, { data: checkins }] = await Promise.all([
    supabase.from("habits").select("id,name").in("id", habitIds),
    supabase.from("checkins").select("habit_id,local_date").in("habit_id", habitIds).is("rejected_at", null),
  ]);
  const names = new Map((habits ?? []).map((h) => [h.id, h.name]));
  const datesOf = (id: string) => (checkins ?? []).filter((c) => c.habit_id === id).map((c) => c.local_date);

  const views: GoalView[] = goals.map((g) => {
    const goal: Goal =
      g.kind === "weekly"
        ? { id: g.id, habitId: g.habit_id, kind: "weekly", target: g.target }
        : { id: g.id, habitId: g.habit_id, kind: "total", target: g.target, startsOn: g.starts_on, deadline: g.deadline };
    const p = goalProgress(goal, datesOf(g.habit_id), today);
    const name = names.get(g.habit_id) ?? "Hábito";
    if (g.kind === "weekly") {
      return { id: g.id, title: name, kind: "weekly", ...p, progressLabel: `${p.current} de ${p.target}` };
    }
    const parts = [`${p.current} de ${p.target}`];
    if (p.current < p.target) parts.push(`faltan ${p.target - p.current}`);
    parts.push(g.deadline ? `hasta el ${shortDate(g.deadline)}` : "sin fecha límite");
    return { id: g.id, title: `${g.target} · ${name}`, kind: "total", ...p, detail: parts.join(" · ") };
  });
  return views.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "weekly" ? -1 : 1));
}
