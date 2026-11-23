import { shiftMonth } from "@/domain/calendar";
import type { WeightEntry } from "@/domain/body";
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
import type { LocalDate } from "@/domain/types";
import { fetchAll } from "@/lib/paginate";
import type { createServerClient } from "@/lib/supabase/server";

// Readers for the detailed logs (reading, workouts) and the private body weights. Always the
// user's own session (RLS: owner only); every query is paged and ordered deterministically.

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

/** One day's log as the calendar shows it (series per exercise, unlike Hoy's short summary). */
export type DayLog =
  | { kind: "reading"; bookTitle: string; fromPage: number; toPage: number; pages: number; finishedBook: boolean }
  | {
      kind: "workout";
      dayTypes: DayType[];
      exercises: { name: string; sets: { reps: number; kg: number }[]; bestKg: number }[];
      volumeKg: number;
    };

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
 * The logs of a calendar month, by check-in id. Bounded to the month's dates. `kinds` says
 * which habit types exist: a kind that is absent is never queried, and the books and
 * exercises are only read when there are entries or sets to name (and then only those ids).
 */
export async function loadMonthLogs(
  supabase: Supabase,
  userId: string,
  range: { first: LocalDate; until: LocalDate },
  kinds: { reading: boolean; workout: boolean },
): Promise<Map<string, DayLog>> {
  const { first, until } = range;
  const [reading, sessions] = await Promise.all([
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
  const [books, sets] = await Promise.all([
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
  return toDayLogs({ reading, sessions, sets, books, exercises });
}
