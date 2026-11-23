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
    .select("id,habit_id,kind,target,starts_on,deadline,created_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at");
  if (habitId) q = q.eq("habit_id", habitId);
  const { data: rows } = await q;
  const goals = rows ?? [];
  if (goals.length === 0) return [] as GoalView[];

  const habitIds = [...new Set(goals.map((g) => g.habit_id))];
  // goals on archived habits are hidden
  const { data: habits } = await supabase.from("habits").select("id,name,color").in("id", habitIds).is("archived_at", null);
  const names = new Map((habits ?? []).map((h) => [h.id, h.name]));
  const colors = new Map((habits ?? []).map((h) => [h.id, toHabitColor(h.color)]));

  const views: GoalView[] = (
    await Promise.all(
      goals
        .filter((g) => names.has(g.habit_id))
        .map(async (g): Promise<GoalView> => {
          const goal: Goal =
            g.kind === "weekly"
              ? { id: g.id, habitId: g.habit_id, kind: "weekly", target: g.target }
              : { id: g.id, habitId: g.habit_id, kind: "total", target: g.target, startsOn: g.starts_on, deadline: g.deadline };
          // One row per habit and day: a bounded head count never hits the API row cap.
          const { from, to } = goalWindow(goal, today);
          const { count } = await supabase
            .from("checkins")
            .select("id", { count: "exact", head: true })
            .eq("habit_id", g.habit_id)
            .is("rejected_at", null)
            .gte("local_date", from)
            .lte("local_date", to);
          const p = goalProgressFromCount(goal, count ?? 0, today);
          const name = names.get(g.habit_id) ?? "Hábito";
          const color = toHabitColor(colors.get(g.habit_id));
          if (g.kind === "weekly") {
            return { id: g.id, title: name, kind: "weekly", ...p, color, progressLabel: `${p.current} de ${p.target}` };
          }
          const parts = [`${p.current} de ${p.target}`];
          if (p.current < p.target) parts.push(`faltan ${p.target - p.current}`);
          parts.push(g.deadline ? `hasta el ${shortDate(g.deadline)}` : "sin fecha límite");
          return { id: g.id, title: `${g.target} · ${name}`, kind: "total", ...p, color, detail: parts.join(" · ") };
        }),
    )
  ).filter(Boolean);
  return views.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "weekly" ? -1 : 1));
}
