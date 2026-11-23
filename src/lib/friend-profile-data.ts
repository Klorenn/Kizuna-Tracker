import "server-only";
import { toHabitColor, type HabitColor } from "@/domain/habit-colors";
import { dailyStreak, weeklyStreak } from "@/domain/streaks";
import type { LocalDate } from "@/domain/types";
import { loadFeedPage } from "@/lib/activity-feed";
import {
  cancelledLabel,
  challengeFrequency,
  dayMonthLabel,
  endsOn,
  frequencyLabel,
  periodStatus,
  weekdayLabel,
} from "@/lib/challenge-view";
import type { FeedPage } from "@/lib/feed";
import { pairRecord } from "@/lib/friend-view";
import { fetchAll } from "@/lib/paginate";
import { activityGrid, lastDays } from "@/lib/profile-view";
import { profileStreaks, streakWindow } from "@/lib/stats";
import type { createServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

export type FriendHabit = {
  id: string;
  name: string;
  color: HabitColor;
  streak: { value: number; unit: "days" | "weeks" };
  week: { date: LocalDate; done: boolean }[];
};

export type SharedChallenge = {
  id: string;
  title: string;
  summary: string;
  state: "open" | "done";
  outcome: string | null;
  /** List order: 0 proposed, 1 active, 2 finished. */
  rank: number;
};

export type FriendProfileData = {
  streaks: ReturnType<typeof profileStreaks>;
  record: { won: number; lost: number; balance: number };
  habits: FriendHabit[];
  activity: ReturnType<typeof activityGrid>;
  latest: FeedPage;
  challenges: SharedChallenge[];
};

const LATEST = 10;

/**
 * Everything the friend view shows, read with the viewer's own session. RLS is the gate: an
 * accepted friend's non-private habits, check-ins and proofs; challenges and debts by
 * participation. Private habits are filtered again here so they can never leak into the view.
 */
export async function loadFriendProfile(
  supabase: Supabase,
  me: string,
  friendId: string,
  today: LocalDate,
  timezone: string,
): Promise<FriendProfileData> {
  const pair = `and(creator_id.eq.${me},rival_id.eq.${friendId}),and(creator_id.eq.${friendId},rival_id.eq.${me})`;
  const [{ data: habitRows }, challenges, debts, latest] = await Promise.all([
    supabase
      .from("habits")
      .select("id,name,color,frequency_type,target_per_week,visibility")
      .eq("user_id", friendId)
      .neq("visibility", "private")
      .is("archived_at", null)
      .order("created_at")
      .limit(1000),
    fetchAll((a, b) =>
      supabase
        .from("challenges")
        .select(
          "id,creator_id,rival_id,creator_habit_id,rival_habit_id,status,frequency_type,target_per_week,weeks,starts_on,cancel_requested_by,created_at",
        )
        .or(pair)
        .order("created_at", { ascending: false })
        .order("id")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase
        .from("debts")
        .select("id,challenge_id,debtor_id,creditor_id,amount,paid_at")
        .or(
          `and(debtor_id.eq.${me},creditor_id.eq.${friendId}),and(debtor_id.eq.${friendId},creditor_id.eq.${me})`,
        )
        .order("id")
        .range(a, b),
    ),
    loadFeedPage(supabase, me, { timezone, owner: friendId, limit: LATEST }),
  ]);
  const habits = (habitRows ?? []).filter((h) => h.visibility !== "private");

  // per-habit history, bounded by date and under the row cap (same window as the own Perfil)
  const { from, limit } = streakWindow(today);
  const history = await Promise.all(
    habits.map(async (h) => {
      const { data } = await supabase
        .from("checkins")
        .select("local_date")
        .eq("habit_id", h.id)
        .is("rejected_at", null)
        .gte("local_date", from)
        .order("local_date", { ascending: false })
        .limit(limit);
      return { ...h, dates: (data ?? []).map((c) => c.local_date) };
    }),
  );

  const habitIds = [...new Set(challenges.flatMap((c) => [c.creator_habit_id, c.rival_habit_id]).filter((x): x is string => !!x))];
  const { data: named } = habitIds.length
    ? await supabase.from("habits").select("id,name").in("id", habitIds)
    : { data: [] };
  const nameOf = new Map((named ?? []).map((h) => [h.id, h.name]));

  const shared = challenges
    .filter((c) => c.status === "proposed" || c.status === "active" || c.status === "finished")
    .map((c): SharedChallenge => {
      const mineId = c.creator_id === me ? c.creator_habit_id : c.rival_habit_id;
      const theirsId = c.creator_id === me ? c.rival_habit_id : c.creator_habit_id;
      const mine = (mineId && nameOf.get(mineId)) || "Tu hábito";
      const theirs = theirsId ? nameOf.get(theirsId) : null;
      const title = theirs ? `${mine} vs ${theirs}` : mine;
      const f = challengeFrequency(c);
      if (c.status === "proposed") {
        return {
          id: c.id,
          title,
          summary: c.creator_id === me ? "Esperando su respuesta" : "Te propuso este reto",
          state: "open",
          outcome: null,
          rank: 0,
        };
      }
      if (c.status === "active") {
        const st = periodStatus(c, today);
        const summary =
          st.state === "pending"
            ? `Empieza el ${c.starts_on ? weekdayLabel(c.starts_on) : ""}`
            : st.state === "over"
              ? "Cerrando el último período"
              : f.type === "weekly"
                ? `Semana ${st.index} de ${st.total} · ${frequencyLabel(f).toLowerCase()}`
                : `Diario · día ${st.index} de ${st.total}`;
        return { id: c.id, title, summary, state: "open", outcome: null, rank: 1 };
      }
      const owed = debts.filter((d) => d.challenge_id === c.id);
      const iOwe = owed.filter((d) => d.debtor_id === me).reduce((s, d) => s + d.amount, 0);
      const theyOwe = owed.filter((d) => d.creditor_id === me).reduce((s, d) => s + d.amount, 0);
      const closing = endsOn(c);
      return {
        id: c.id,
        title,
        summary: closing ? `Terminó el ${dayMonthLabel(closing)}` : cancelledLabel(c),
        state: "done",
        outcome: theyOwe > iOwe ? "Ganaste" : theyOwe < iOwe ? "Perdiste" : "Empate",
        rank: 2,
      };
    })
    .sort((a, b) => a.rank - b.rank);

  return {
    streaks: profileStreaks(history, today),
    record: pairRecord(me, friendId, challenges, debts),
    habits: history.map((h) => {
      const weekly = h.frequency_type === "weekly";
      return {
        id: h.id,
        name: h.name,
        color: toHabitColor(h.color),
        streak: {
          value: weekly ? weeklyStreak(h.dates, h.target_per_week ?? 1, today) : dailyStreak(h.dates, today),
          unit: weekly ? ("weeks" as const) : ("days" as const),
        },
        week: lastDays(h.dates, today),
      };
    }),
    activity: activityGrid(history, today),
    latest,
    challenges: shared,
  };
}
