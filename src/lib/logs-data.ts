import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { shiftMonth } from "@/domain/calendar";
import type { WeightEntry } from "@/domain/body";
import { CARDIO_KINDS, type CardioEntry, type CardioKind } from "@/domain/cardio";
import {
  DAY_TYPES,
  MUSCLE_GROUPS,
  pagesRead,
  type Book,
  type DayType,
  type ExerciseRef,
  type MuscleGroup,
  type ReadingEntry,
  type WorkoutDraft,
  type WorkoutSet,
} from "@/domain/logs";
import { QUANTITY_UNITS, type QuantityConfig, type QuantityEntry, type QuantityUnit } from "@/domain/quantity";
import type { TimeEntry } from "@/domain/time";
import type { LocalDate } from "@/domain/types";
import { entryMinutes, type MediaItem, type MediaKind, type WatchEntry } from "@/domain/watch";
import { fetchAll } from "@/lib/paginate";
import type { createServerClient } from "@/lib/supabase/server";

// Readers for the detailed logs (reading, workouts, time, series, quantity, distance) and the
// private body weights. Always the user's own session (RLS: owner only); every query is paged
// and ordered deterministically.

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

/** One day's log as the calendar shows it (series per exercise, unlike Hoy's short summary). */
export type DayLog =
  | {
      kind: "reading";
      bookTitle: string;
      fromPage: number;
      toPage: number;
      pages: number;
      finishedBook: boolean;
      /** Pages of the book, for "página 40 de 412 · 10 %". */
      totalPages?: number | null;
    }
  | {
      kind: "workout";
      dayTypes: DayType[];
      exercises: { name: string; sets: { reps: number; kg: number }[]; bestKg: number }[];
      volumeKg: number;
    }
  | { kind: "time"; minutes: number; topic: string | null; pomodoros: number }
  | {
      kind: "watch";
      title: string;
      mediaKind: MediaKind;
      episodes: number | null;
      season: number | null;
      episodeTo: number | null;
      minutes: number;
      completed: boolean;
    }
  | {
      kind: "quantity";
      total: number;
      target: number;
      config: QuantityConfig;
      /** Each sum with its local time of day, `H:mm`. */
      entries: { amount: number; time: string }[];
    }
  | { kind: "cardio"; entries: { id: string; kind: CardioKind; distanceM: number; durationS: number }[] };

/** Rows with the database column names. */
export type ReadingRow = { checkin_id: string; book_id: string; local_date: LocalDate; from_page: number; to_page: number };
export type SessionRow = { id: string; checkin_id: string; local_date: LocalDate; day_types: string[] };
export type SetRow = {
  session_id: string;
  exercise_id: string;
  position: number;
  reps: number;
  /** numeric(6,2): PostgREST may hand it over as a string */
  weight_kg: number | string;
  local_date: LocalDate;
};
type BookRow = {
  id: string;
  title: string;
  author: string | null;
  total_pages: number | null;
  status: string;
  finished_on: LocalDate | null;
};
type ExerciseRow = { id: string; name: string; muscle_group: string };
export type TimeRow = { checkin_id: string; minutes: number; topic: string | null; pomodoros: number };
export type WatchRow = {
  checkin_id: string;
  media_id: string;
  local_date: LocalDate;
  episodes: number | null;
  season: number | null;
  episode_to: number | null;
  minutes: number | null;
  completed: boolean;
};
export type CardioRow = {
  id: string;
  checkin_id: string;
  kind: string;
  distance_m: number;
  duration_s: number;
  created_at: string;
};
export type QuantityRow = {
  id: string;
  habit_id: string;
  local_date: LocalDate;
  /** numeric(10,2): PostgREST may hand it over as a string */
  amount: number | string;
  created_at: string;
};
type MediaRow = {
  id: string;
  title: string;
  kind: string;
  total_seasons: number | null;
  total_episodes: number | null;
  runtime_min: number | null;
  status: string;
  finished_on: LocalDate | null;
};

/** The quantity columns of a habit row (all optional: only `quantity` habits have them). */
export type QuantityColumns = {
  quantity_unit?: string | null;
  quantity_label?: string | null;
  quantity_target?: number | string | null;
  quantity_step?: number | string | null;
  quantity_display?: string | null;
  glass_ml?: number | null;
};
/** Columns to select on `habits` to build a `QuantityConfig`. */
export const QUANTITY_COLUMNS = "quantity_unit,quantity_label,quantity_target,quantity_step,quantity_display,glass_ml";

/** The goal of a quantity habit from its row; null when the habit has no quantity setup. */
export function quantityConfigOf(h: QuantityColumns): QuantityConfig | null {
  const unit = h.quantity_unit;
  if (!unit || !(QUANTITY_UNITS as readonly string[]).includes(unit)) return null;
  if (h.quantity_target == null || h.quantity_step == null) return null;
  return {
    unit: unit as QuantityUnit,
    label: h.quantity_label ?? null,
    target: Number(h.quantity_target),
    step: Number(h.quantity_step),
    display: h.quantity_display === "glasses" ? "glasses" : "base",
    glassMl: h.glass_ml ?? 250,
  };
}

const toMedia = (m: MediaRow): MediaItem => ({
  id: m.id,
  title: m.title,
  kind: m.kind === "movie" ? "movie" : "series",
  totalSeasons: m.total_seasons,
  totalEpisodes: m.total_episodes,
  runtimeMin: m.runtime_min,
  status: m.status === "finished" ? "finished" : "watching",
  finishedOn: m.finished_on,
});
const MEDIA_COLUMNS = "id,title,kind,total_seasons,total_episodes,runtime_min,status,finished_on";
const toCardioKind = (raw: string): CardioKind =>
  (CARDIO_KINDS as readonly string[]).includes(raw) ? (raw as CardioKind) : "other";
const localTimeOfDay = (iso: string, tz: string) => format(new TZDate(new Date(iso), tz), "H:mm");

// The one-line texts live in the pure `log-text` module (client components use them); kept
// reachable from here for the server code that already imports them.
export { timeLine, watchLine } from "@/lib/log-text";

const round2 = (x: number) => Math.round(x * 100) / 100;
const toDayTypes = (raw: string[]): DayType[] => raw.filter((t): t is DayType => (DAY_TYPES as readonly string[]).includes(t));
const toGroup = (raw: string): MuscleGroup =>
  (MUSCLE_GROUPS as readonly string[]).includes(raw) ? (raw as MuscleGroup) : "legs";

export const toBook = (b: BookRow): Book => ({
  id: b.id,
  title: b.title,
  author: b.author,
  totalPages: b.total_pages,
  status: b.status === "finished" ? "finished" : "reading",
  finishedOn: b.finished_on,
});
export const toExerciseRef = (e: ExerciseRow): ExerciseRef => ({ id: e.id, name: e.name, group: toGroup(e.muscle_group) });

/** Sets of one session grouped by exercise, in the order they were entered (`position`). */
function groupSets(sets: SetRow[]): { exerciseId: string; sets: { reps: number; kg: number }[] }[] {
  const out: { exerciseId: string; sets: { reps: number; kg: number }[] }[] = [];
  for (const s of [...sets].sort((a, b) => a.position - b.position)) {
    let entry = out.find((e) => e.exerciseId === s.exercise_id);
    if (!entry) {
      entry = { exerciseId: s.exercise_id, sets: [] };
      out.push(entry);
    }
    entry.sets.push({ reps: s.reps, kg: Number(s.weight_kg) });
  }
  return out;
}

const bySession = (sets: SetRow[]) => {
  const map = new Map<string, SetRow[]>();
  for (const s of sets) {
    const list = map.get(s.session_id);
    if (list) list.push(s);
    else map.set(s.session_id, [s]);
  }
  return map;
};

/** Logs by check-in id. `finishedBook`: the book was finished on that reading's date. */
export function toDayLogs(rows: {
  reading: ReadingRow[];
  sessions: SessionRow[];
  sets: SetRow[];
  books: Book[];
  exercises: ExerciseRef[];
  time?: TimeRow[];
  watch?: WatchRow[];
  /** The titles the `watch` rows point at. */
  media?: MediaItem[];
  cardio?: CardioRow[];
}): Map<string, DayLog> {
  const books = new Map(rows.books.map((b) => [b.id, b]));
  const names = new Map(rows.exercises.map((e) => [e.id, e.name]));
  const out = new Map<string, DayLog>();

  for (const r of rows.reading) {
    const book = books.get(r.book_id);
    out.set(r.checkin_id, {
      kind: "reading",
      bookTitle: book?.title ?? "Libro",
      fromPage: r.from_page,
      toPage: r.to_page,
      pages: pagesRead({ fromPage: r.from_page, toPage: r.to_page }),
      finishedBook: book?.status === "finished" && book.finishedOn === r.local_date,
      totalPages: book?.totalPages ?? null,
    });
  }

  const setsBy = bySession(rows.sets);
  for (const s of rows.sessions) {
    const exercises = groupSets(setsBy.get(s.id) ?? []).map((e) => ({
      name: names.get(e.exerciseId) ?? "Ejercicio",
      sets: e.sets,
      bestKg: Math.max(0, ...e.sets.map((x) => x.kg)),
    }));
    const volume = exercises.reduce((sum, e) => sum + e.sets.reduce((v, x) => v + x.reps * x.kg, 0), 0);
    out.set(s.checkin_id, { kind: "workout", dayTypes: toDayTypes(s.day_types), exercises, volumeKg: round2(volume) });
  }

  for (const t of rows.time ?? []) {
    out.set(t.checkin_id, { kind: "time", minutes: t.minutes, topic: t.topic, pomodoros: t.pomodoros });
  }

  const titles = new Map((rows.media ?? []).map((m) => [m.id, m]));
  for (const w of rows.watch ?? []) {
    const media = titles.get(w.media_id);
    const entry: WatchEntry = {
      date: w.local_date,
      mediaId: w.media_id,
      episodes: w.episodes,
      season: w.season,
      episodeTo: w.episode_to,
      minutes: w.minutes,
      completed: w.completed,
    };
    out.set(w.checkin_id, {
      kind: "watch",
      title: media?.title ?? "Título",
      mediaKind: media?.kind ?? (w.episodes !== null ? "series" : "movie"),
      episodes: w.episodes,
      season: w.season,
      episodeTo: w.episode_to,
      minutes: entryMinutes(entry, media),
      completed: w.completed,
    });
  }

  // several outings per check-in: one log, outings in the order they were created
  const outings = new Map<string, CardioRow[]>();
  for (const c of rows.cardio ?? []) {
    const list = outings.get(c.checkin_id);
    if (list) list.push(c);
    else outings.set(c.checkin_id, [c]);
  }
  for (const [checkinId, list] of outings) {
    out.set(checkinId, {
      kind: "cardio",
      entries: [...list]
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
        .map((c) => ({ id: c.id, kind: toCardioKind(c.kind), distanceM: c.distance_m, durationS: c.duration_s })),
    });
  }
  return out;
}

/**
 * Quantity logs by `habitId:date` (they have no check-in: sums exist before the goal is met).
 * Each sum carries its local time of day; the total is rounded to 2 decimals.
 */
export function toQuantityDayLogs(input: {
  rows: QuantityRow[];
  habits: { id: string; config: QuantityConfig }[];
  timezone: string;
}): Map<string, DayLog> {
  const configs = new Map(input.habits.map((h) => [h.id, h.config]));
  const sorted = [...input.rows].sort(
    (a, b) => a.local_date.localeCompare(b.local_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  const out = new Map<string, Extract<DayLog, { kind: "quantity" }>>();
  for (const r of sorted) {
    const config = configs.get(r.habit_id);
    if (!config) continue;
    const key = `${r.habit_id}:${r.local_date}`;
    const day = out.get(key) ?? { kind: "quantity" as const, total: 0, target: config.target, config, entries: [] };
    const amount = Number(r.amount);
    day.total = round2(day.total + amount);
    day.entries.push({ amount, time: localTimeOfDay(r.created_at, input.timezone) });
    out.set(key, day);
  }
  return out;
}

/** Start of the stats window: the first day of today's month, twelve months back. */
export function logWindowStart(today: LocalDate): LocalDate {
  return `${shiftMonth(today.slice(0, 7), -12)}-01`;
}

async function loadBooks(supabase: Supabase, userId: string): Promise<Book[]> {
  const rows = await fetchAll<BookRow>((from, to) =>
    supabase
      .from("books")
      .select("id,title,author,total_pages,status,finished_on")
      .eq("user_id", userId)
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  return rows.map(toBook);
}

/** Catalog plus own exercises, archived included (old sets still point at them). */
async function loadExercises(supabase: Supabase, userId: string): Promise<ExerciseRef[]> {
  const rows = await fetchAll<ExerciseRow>((from, to) =>
    supabase
      .from("exercises")
      .select("id,name,muscle_group")
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .order("name")
      .order("id")
      .range(from, to),
  );
  return rows.map(toExerciseRef);
}

export async function loadReadingData(
  supabase: Supabase,
  userId: string,
  from: LocalDate,
): Promise<{ books: Book[]; entries: ReadingEntry[] }> {
  const [books, rows] = await Promise.all([
    loadBooks(supabase, userId),
    fetchAll<ReadingRow>((a, b) =>
      supabase
        .from("reading_entries")
        .select("checkin_id,book_id,local_date,from_page,to_page")
        .eq("user_id", userId)
        .gte("local_date", from)
        .order("local_date")
        .order("id")
        .range(a, b),
    ),
  ]);
  return {
    books,
    entries: rows.map((r) => ({ date: r.local_date, bookId: r.book_id, fromPage: r.from_page, toPage: r.to_page })),
  };
}

export async function loadWorkoutData(
  supabase: Supabase,
  userId: string,
  from: LocalDate,
  opts: { exercises?: boolean } = {},
): Promise<{ exercises: ExerciseRef[]; sets: WorkoutSet[]; sessions: ({ date: LocalDate } & WorkoutDraft)[] }> {
  const [setRows, sessionRows] = await Promise.all([
    fetchAll<SetRow>((a, b) =>
      supabase
        .from("workout_sets")
        .select("session_id,exercise_id,position,reps,weight_kg,local_date")
        .eq("user_id", userId)
        .gte("local_date", from)
        .order("local_date")
        .order("id")
        .range(a, b),
    ),
    fetchAll<SessionRow>((a, b) =>
      supabase
        .from("workout_sessions")
        .select("id,checkin_id,local_date,day_types")
        .eq("user_id", userId)
        .gte("local_date", from)
        .order("local_date")
        .order("id")
        .range(a, b),
    ),
  ]);
  // the catalog is only needed to name sets: skip it when there are none (or the caller does not name them)
  const exercises = opts.exercises === false || setRows.length === 0 ? [] : await loadExercises(supabase, userId);
  const setsBy = bySession(setRows);
  return {
    exercises,
    sets: setRows.map((s) => ({
      sessionId: s.session_id,
      date: s.local_date,
      exerciseId: s.exercise_id,
      reps: s.reps,
      kg: Number(s.weight_kg),
    })),
    sessions: sessionRows.map((s) => ({
      date: s.local_date,
      dayTypes: toDayTypes(s.day_types),
      exercises: groupSets(setsBy.get(s.id) ?? []),
    })),
  };
}

/** Time entries (all of the user's `time` habits) from `from`, oldest first. */
export async function loadTimeData(supabase: Supabase, userId: string, from: LocalDate): Promise<TimeEntry[]> {
  const rows = await fetchAll<{
    local_date: LocalDate;
    habit_id: string;
    minutes: number;
    topic: string | null;
    pomodoros: number;
  }>((a, b) =>
    supabase
      .from("time_entries")
      .select("local_date,habit_id,minutes,topic,pomodoros")
      .eq("user_id", userId)
      .gte("local_date", from)
      .order("local_date")
      .order("id")
      .range(a, b),
  );
  return rows.map((r) => ({
    date: r.local_date,
    habitId: r.habit_id,
    minutes: r.minutes,
    topic: r.topic,
    pomodoros: r.pomodoros,
  }));
}

/**
 * Titles (all of them: an entry may point at an old one) and the entries from `from`. With
 * `habitId` only that habit's entries (the habit detail); without it all of the user's.
 */
export async function loadWatchData(
  supabase: Supabase,
  userId: string,
  from: LocalDate,
  habitId?: string,
): Promise<{ media: MediaItem[]; entries: WatchEntry[] }> {
  const [media, rows] = await Promise.all([
    fetchAll<MediaRow>((a, b) =>
      supabase
        .from("media_items")
        .select(MEDIA_COLUMNS)
        .eq("user_id", userId)
        .order("created_at")
        .order("id")
        .range(a, b),
    ),
    fetchAll<Omit<WatchRow, "checkin_id">>((a, b) =>
      (habitId
        ? supabase
            .from("watch_entries")
            .select("media_id,local_date,episodes,season,episode_to,minutes,completed")
            .eq("habit_id", habitId)
        : supabase
            .from("watch_entries")
            .select("media_id,local_date,episodes,season,episode_to,minutes,completed")
      )
        .eq("user_id", userId)
        .gte("local_date", from)
        .order("local_date")
        .order("id")
        .range(a, b),
    ),
  ]);
  return {
    media: media.map(toMedia),
    entries: rows.map((r) => ({
      date: r.local_date,
      mediaId: r.media_id,
      episodes: r.episodes,
      season: r.season,
      episodeTo: r.episode_to,
      minutes: r.minutes,
      completed: r.completed,
    })),
  };
}

/** Episodes of one series seen since ever (no window): "5 de 26" must not forget old ones. */
export async function loadSeenEpisodes(supabase: Supabase, userId: string, mediaId: string): Promise<number> {
  const rows = await fetchAll<{ episodes: number | null }>((a, b) =>
    supabase
      .from("watch_entries")
      .select("episodes")
      .eq("user_id", userId)
      .eq("media_id", mediaId)
      .order("local_date")
      .order("id")
      .range(a, b),
  );
  return rows.reduce((sum, r) => sum + (r.episodes ?? 0), 0);
}

/**
 * Sums and goal-met days of several quantity habits in ONE pair of queries (`in(habit_id)`),
 * grouped here. A goal-met day is a check-in of the habit that was not rejected.
 */
export async function loadQuantityForHabits(
  supabase: Supabase,
  userId: string,
  habitIds: string[],
  from: LocalDate,
): Promise<Map<string, { entries: QuantityEntry[]; doneDates: LocalDate[] }>> {
  const out = new Map(habitIds.map((id) => [id, { entries: [] as QuantityEntry[], doneDates: [] as LocalDate[] }]));
  if (habitIds.length === 0) return out;
  const [rows, checkins] = await Promise.all([
    fetchAll<{ habit_id: string; local_date: LocalDate; amount: number | string }>((a, b) =>
      supabase
        .from("quantity_entries")
        .select("habit_id,local_date,amount")
        .eq("user_id", userId)
        .in("habit_id", habitIds)
        .gte("local_date", from)
        .order("local_date")
        .order("created_at")
        .order("id")
        .range(a, b),
    ),
    fetchAll<{ habit_id: string; local_date: LocalDate }>((a, b) =>
      supabase
        .from("checkins")
        .select("habit_id,local_date")
        .eq("user_id", userId)
        .in("habit_id", habitIds)
        .is("rejected_at", null)
        .gte("local_date", from)
        .order("local_date")
        .order("id")
        .range(a, b),
    ),
  ]);
  for (const r of rows) out.get(r.habit_id)?.entries.push({ date: r.local_date, amount: Number(r.amount) });
  for (const c of checkins) {
    const done = out.get(c.habit_id)?.doneDates;
    if (done && done[done.length - 1] !== c.local_date) done.push(c.local_date);
  }
  return out;
}

/** The sums and goal-met days of one quantity habit from `from`. */
export async function loadQuantityData(
  supabase: Supabase,
  userId: string,
  habitId: string,
  from: LocalDate,
): Promise<{ entries: QuantityEntry[]; doneDates: LocalDate[] }> {
  const all = await loadQuantityForHabits(supabase, userId, [habitId], from);
  return all.get(habitId) ?? { entries: [], doneDates: [] };
}

/**
 * Distance outings from `from`, oldest first. With `habitId` only that habit's outings (the
 * habit detail); without it every distance habit of the user (the Resumen totals).
 */
export async function loadCardioData(
  supabase: Supabase,
  userId: string,
  from: LocalDate,
  habitId?: string,
): Promise<CardioEntry[]> {
  const rows = await fetchAll<{
    id: string;
    local_date: LocalDate;
    kind: string;
    distance_m: number;
    duration_s: number;
  }>((a, b) =>
    (habitId
      ? supabase.from("cardio_entries").select("id,local_date,kind,distance_m,duration_s").eq("habit_id", habitId)
      : supabase.from("cardio_entries").select("id,local_date,kind,distance_m,duration_s")
    )
      .eq("user_id", userId)
      .gte("local_date", from)
      .order("local_date")
      .order("created_at")
      .order("id")
      .range(a, b),
  );
  return rows.map((r) => ({
    id: r.id,
    date: r.local_date,
    kind: toCardioKind(r.kind),
    distanceM: r.distance_m,
    durationS: r.duration_s,
  }));
}

/**
 * Days with a counted visit: check-ins without a rejection of the user's `workout` habits,
 * archived habits included. Distinct dates, oldest first.
 */
export async function loadVisitDates(supabase: Supabase, userId: string, from: LocalDate): Promise<LocalDate[]> {
  const habits = await fetchAll<{ id: string }>((a, b) =>
    supabase
      .from("habits")
      .select("id")
      .eq("user_id", userId)
      .eq("log_type", "workout")
      .order("created_at")
      .order("id")
      .range(a, b),
  );
  if (habits.length === 0) return [];
  const rows = await fetchAll<{ local_date: LocalDate }>((a, b) =>
    supabase
      .from("checkins")
      .select("local_date")
      .eq("user_id", userId)
      .in(
        "habit_id",
        habits.map((h) => h.id),
      )
      .is("rejected_at", null)
      .gte("local_date", from)
      .order("local_date")
      .order("id")
      .range(a, b),
  );
  return [...new Set(rows.map((r) => r.local_date))].sort();
}

/** Private body weights from `from` (to `to`, if given; owner only, RLS), as numbers. */
export async function loadWeights(
  supabase: Supabase,
  userId: string,
  from: LocalDate,
  to?: LocalDate,
): Promise<WeightEntry[]> {
  const rows = await fetchAll<{ measured_on: LocalDate; weight_kg: number | string }>((a, b) => {
    const q = supabase
      .from("body_weights")
      .select("measured_on,weight_kg")
      .eq("user_id", userId)
      .gte("measured_on", from);
    return (to ? q.lte("measured_on", to) : q).order("measured_on").order("id").range(a, b);
  });
  return rows.map((r) => ({ date: r.measured_on, kg: Number(r.weight_kg) }));
}

/** Newest weigh-in of the user, whenever it was (owner only, RLS); null with none. */
export async function loadLatestWeight(supabase: Supabase, userId: string): Promise<WeightEntry | null> {
  const { data } = await supabase
    .from("body_weights")
    .select("measured_on,weight_kg")
    .eq("user_id", userId)
    .order("measured_on", { ascending: false })
    .order("id", { ascending: false })
    .range(0, 0);
  const row = (data as { measured_on: LocalDate; weight_kg: number | string }[] | null)?.[0];
  return row ? { date: row.measured_on, kg: Number(row.weight_kg) } : null;
}

/**
 * The weights from `from` and, when there are none in the window, the newest one whenever it was.
 * Both reads start together (the latest is one cheap indexed row), so the "older than the window"
 * case costs no extra serial level.
 */
export async function loadWeightsAndLatest(
  supabase: Supabase,
  userId: string,
  from: LocalDate,
): Promise<{ entries: WeightEntry[]; latest: WeightEntry | null }> {
  const latestRead = loadLatestWeight(supabase, userId);
  latestRead.catch(() => {}); // unused when the window has entries
  const entries = await loadWeights(supabase, userId, from);
  return { entries, latest: entries.length === 0 ? await latestRead : null };
}

/**
 * The logs of a calendar month (`byCheckin`: by check-in id). Bounded to the month's dates. `kinds` says
 * which habit types exist: a kind that is absent is never queried, and the books and
 * exercises are only read when there are entries or sets to name (and then only those ids).
 */
export async function loadMonthLogs(
  supabase: Supabase,
  userId: string,
  range: { first: LocalDate; until: LocalDate },
  kinds: {
    reading: boolean;
    workout: boolean;
    time?: boolean;
    watch?: boolean;
    cardio?: boolean;
    /** Quantity habits with their goal and the profile zone (hours of each sum). */
    quantity?: { habits: { id: string; config: QuantityConfig }[]; timezone: string };
  },
): Promise<MonthLogs> {
  const { first, until } = range;
  const quantityHabits = kinds.quantity?.habits ?? [];
  const quantityIds = quantityHabits.map((h) => h.id);
  const [time, watch, cardio, quantityRows, reading, sessions] = await Promise.all([
    kinds.time
      ? fetchAll<TimeRow>((a, b) =>
          supabase
            .from("time_entries")
            .select("checkin_id,minutes,topic,pomodoros")
            .eq("user_id", userId)
            .gte("local_date", first)
            .lte("local_date", until)
            .order("local_date")
            .order("id")
            .range(a, b),
        )
      : Promise.resolve<TimeRow[]>([]),
    kinds.watch
      ? fetchAll<WatchRow>((a, b) =>
          supabase
            .from("watch_entries")
            .select("checkin_id,media_id,local_date,episodes,season,episode_to,minutes,completed")
            .eq("user_id", userId)
            .gte("local_date", first)
            .lte("local_date", until)
            .order("local_date")
            .order("id")
            .range(a, b),
        )
      : Promise.resolve<WatchRow[]>([]),
    kinds.cardio
      ? fetchAll<CardioRow>((a, b) =>
          supabase
            .from("cardio_entries")
            .select("id,checkin_id,kind,distance_m,duration_s,created_at")
            .eq("user_id", userId)
            .gte("local_date", first)
            .lte("local_date", until)
            .order("local_date")
            .order("created_at")
            .order("id")
            .range(a, b),
        )
      : Promise.resolve<CardioRow[]>([]),
    quantityIds.length > 0
      ? fetchAll<QuantityRow>((a, b) =>
          supabase
            .from("quantity_entries")
            .select("id,habit_id,local_date,amount,created_at")
            .eq("user_id", userId)
            .in("habit_id", quantityIds)
            .gte("local_date", first)
            .lte("local_date", until)
            .order("local_date")
            .order("created_at")
            .order("id")
            .range(a, b),
        )
      : Promise.resolve<QuantityRow[]>([]),
    kinds.reading
      ? fetchAll<ReadingRow>((a, b) =>
          supabase
            .from("reading_entries")
            .select("checkin_id,book_id,local_date,from_page,to_page")
            .eq("user_id", userId)
            .gte("local_date", first)
            .lte("local_date", until)
            .order("local_date")
            .order("id")
            .range(a, b),
        )
      : Promise.resolve<ReadingRow[]>([]),
    kinds.workout
      ? fetchAll<SessionRow>((a, b) =>
          supabase
            .from("workout_sessions")
            .select("id,checkin_id,local_date,day_types")
            .eq("user_id", userId)
            .gte("local_date", first)
            .lte("local_date", until)
            .order("local_date")
            .order("id")
            .range(a, b),
        )
      : Promise.resolve<SessionRow[]>([]),
  ]);
  const bookIds = [...new Set(reading.map((r) => r.book_id))];
  const mediaIds = [...new Set(watch.map((w) => w.media_id))];
  const quantityByHabitDay = kinds.quantity
    ? toQuantityDayLogs({ rows: quantityRows, habits: quantityHabits, timezone: kinds.quantity.timezone })
    : new Map<string, DayLog>();
  const [books, sets, media] = await Promise.all([
    bookIds.length > 0
      ? fetchAll<BookRow>((a, b) =>
          supabase
            .from("books")
            .select("id,title,author,total_pages,status,finished_on")
            .eq("user_id", userId)
            .in("id", bookIds)
            .order("id")
            .range(a, b),
        ).then((rows) => rows.map(toBook))
      : Promise.resolve<Book[]>([]),
    sessions.length > 0
      ? fetchAll<SetRow>((a, b) =>
          supabase
            .from("workout_sets")
            .select("session_id,exercise_id,position,reps,weight_kg,local_date")
            .eq("user_id", userId)
            .gte("local_date", first)
            .lte("local_date", until)
            .order("local_date")
            .order("id")
            .range(a, b),
        )
      : Promise.resolve<SetRow[]>([]),
    mediaIds.length > 0
      ? fetchAll<MediaRow>((a, b) =>
          supabase
            .from("media_items")
            .select(MEDIA_COLUMNS)
            .eq("user_id", userId)
            .in("id", mediaIds)
            .order("id")
            .range(a, b),
        ).then((rows) => rows.map(toMedia))
      : Promise.resolve<MediaItem[]>([]),
  ]);
  const exerciseIds = [...new Set(sets.map((s) => s.exercise_id))];
  const exercises =
    exerciseIds.length > 0
      ? (
          await fetchAll<ExerciseRow>((a, b) =>
            supabase
              .from("exercises")
              .select("id,name,muscle_group")
              .in("id", exerciseIds)
              .order("id")
              .range(a, b),
          )
        ).map(toExerciseRef)
      : [];
  const logs = toDayLogs({ reading, sessions, sets, books, exercises, time, watch, media, cardio });
  return { byCheckin: logs, quantityByHabitDay };
}

/** The logs of a month by check-in id, and the quantity logs by `habitId:date` (no check-in), as plain fields. */
export type MonthLogs = { byCheckin: Map<string, DayLog>; quantityByHabitDay: Map<string, DayLog> };
