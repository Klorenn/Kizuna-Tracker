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
  subRetosLabel,
  weekdayLabel,
} from "@/lib/challenge-view";
import type { FeedPage } from "@/lib/feed";
import { pairRecord } from "@/lib/friend-view";
import { untypedDb } from "@/lib/untyped-db";
import { loadCheckinDates } from "@/lib/checkin-dates";
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
  /** Open challenge only: this viewer may add a sub-reto (active: either player; proposed: its creator). */
  canAdd: boolean;
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
  /** Sections whose reads failed: the view shows a small retry there instead of failing the page. */
  failed: FriendSection[];
};

export type FriendSection = "habits" | "challenges" | "latest";

const LATEST = 10;

/** The sub-retos embedded in each challenge (live ones are proposed or active). */
type ItemEmbed = { position: number; status: string; creator_habit_id: string | null; rival_habit_id: string | null };
type PairChallenge = {
  id: string;
  creator_id: string;
  rival_id: string;
  creator_habit_id: string;
  rival_habit_id: string | null;
  status: string;
  frequency_type: string;
  target_per_week: number | null;
  weeks: number;
  starts_on: string | null;
  cancel_requested_by: string | null;
  created_at: string;
  challenge_items?: ItemEmbed[] | null;
};

const liveItems = (c: PairChallenge) =>
  (c.challenge_items ?? [])
    .filter((i) => i.status === "proposed" || i.status === "active")
    .sort((a, b) => a.position - b.position);

/** One section's reads: its value, or null when any of them failed (never throws). */
async function attempt<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

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
  const { from } = streakWindow(today);

  // each section reads on its own: one transient error degrades that section, not the whole page
  const [habitsRead, pairRead, latestRead] = await Promise.all([
    attempt(async () => {
      const rows = must(
        await supabase
          .from("habits")
          .select("id,name,color,frequency_type,target_per_week,visibility")
          .eq("user_id", friendId)
          .neq("visibility", "private")
          .is("archived_at", null)
          .order("created_at")
          .limit(1000),
      ).filter((h) => h.visibility !== "private");
      // history of every habit in one call (one row per habit; same date window as the own Perfil)
      const history = await loadCheckinDates(supabase, rows.map((h) => h.id), from);
      if (!history.ok) throw new Error("checkin_dates failed");
      return rows.map((h) => ({ ...h, dates: history.byHabit.get(h.id) ?? [] }));
    }),
    attempt(async () => {
      const [rows, debts] = await Promise.all([
        fetchAll<unknown>((a, b) =>
          // TODO(sub-retos types): challenge_items is not in the generated types yet
          untypedDb(supabase)
            .from("challenges")
            .select(
              "id,creator_id,rival_id,creator_habit_id,rival_habit_id,status,frequency_type,target_per_week,weeks,starts_on,cancel_requested_by,created_at,challenge_items(position,status,creator_habit_id,rival_habit_id)",
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
      ]);
      const challenges = rows as PairChallenge[];
      const habitIds = [
        ...new Set(
          challenges
            .flatMap((c) => [
              c.creator_habit_id,
              c.rival_habit_id,
              ...(c.challenge_items ?? []).flatMap((i) => [i.creator_habit_id, i.rival_habit_id]),
            ])
            .filter((x): x is string => !!x),
        ),
      ];
      const named = habitIds.length ? must(await supabase.from("habits").select("id,name").in("id", habitIds)) : [];
      return { challenges, debts, named };
    }),
    attempt(() => loadFeedPage(supabase, me, { timezone, owner: friendId, limit: LATEST })),
  ]);
  const failed: FriendSection[] = [
    ...(habitsRead ? [] : (["habits"] as const)),
    ...(pairRead ? [] : (["challenges"] as const)),
    ...(latestRead ? [] : (["latest"] as const)),
  ];
  const history = habitsRead ?? [];
  const challenges = pairRead?.challenges ?? [];
  const debts = pairRead?.debts ?? [];
  const latest: FeedPage = latestRead ?? { items: [], next: null };
  const nameOf = new Map((pairRead?.named ?? []).map((h) => [h.id, h.name]));

  const shared = challenges
    .filter((c) => c.status === "proposed" || c.status === "active" || c.status === "finished")
    .map((c): SharedChallenge => {
      // the first live sub-reto names the challenge; the legacy columns mirror it for old rows
      const live = liveItems(c);
      const first = live[0];
      const iAmCreator = c.creator_id === me;
      const mineId = first
        ? iAmCreator
          ? first.creator_habit_id
          : first.rival_habit_id
        : iAmCreator
          ? c.creator_habit_id
          : c.rival_habit_id;
      const theirsId = first
        ? iAmCreator
          ? first.rival_habit_id
          : first.creator_habit_id
        : iAmCreator
          ? c.rival_habit_id
          : c.creator_habit_id;
      const mine = (mineId && nameOf.get(mineId)) || "Tu hábito";
      const theirs = theirsId ? nameOf.get(theirsId) : null;
      const more = subRetosLabel(live.length);
      const title = [theirs ? `${mine} vs ${theirs}` : mine, more].filter(Boolean).join(" ");
      const f = challengeFrequency(c);
      if (c.status === "proposed") {
        return {
          id: c.id,
          title,
          summary: c.creator_id === me ? "Esperando su respuesta" : "Te propuso este reto",
          state: "open",
          outcome: null,
          canAdd: c.creator_id === me,
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
        return { id: c.id, title, summary, state: "open", outcome: null, canAdd: true, rank: 1 };
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
        canAdd: false,
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
    failed,
  };
}
