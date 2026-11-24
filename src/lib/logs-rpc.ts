import type { SupabaseClient } from "@supabase/supabase-js";
import { validateBook, toSetsPayload, validateWorkoutDraft, MUSCLE_GROUPS, type BookInput, type ExerciseRef, type MuscleGroup, type WorkoutDraft } from "@/domain/logs";
import { validateMedia, validateWatchInput, type MediaInput, type MediaItem } from "@/domain/watch";
import { CARDIO_KINDS, type CardioKind } from "@/domain/cardio";
import { CARDIO_OUTING_LOST, cardioFields, cardioMessageFor, checkCardio, type CardioInput } from "@/lib/cardio-copy";
import { READING_GENERIC, READING_LOST, checkReadingPages, readingArgs, readingMessageFor, type ReadingInput } from "@/lib/reading-copy";
import type { Database } from "@/lib/supabase/database.types";
import { WATCH_ERRORS, WATCH_GENERIC, WATCH_LOST, checkWatchShape, watchArgs, watchMessageFor, type WatchInput } from "@/lib/watch-copy";
import { GENERIC as CHECKIN_GENERIC, messageFor as checkinMessageFor } from "@/lib/tracking-copy";
import { WORKOUT_GENERIC, validateExerciseName, workoutMessageFor } from "@/lib/workout-copy";

type Supabase = SupabaseClient<Database>;
export type LogResult = { ok: true } | { ok: false; error: string };
export type CheckInThenResult =
  | { ok: true; checkinId: string; created: boolean }
  | { ok: false; error: string; checkedIn: boolean };

/**
 * Typed wrappers of the reading, workout, cardio and watch RPCs, shared by the native app (the web keeps its server
 * actions, which use the same copy and checks). Never throw: a failure is `{ok:false,error}` in Spanish.
 */

/**
 * "Guardar" / "Solo marcar": checks the habit in and, with an entry, saves it on that check-in. When the entry fails
 * the habit stays checked (`checkedIn: true`) so the screen can say so and retry with the save wrapper.
 */
async function checkInThen(
  supabase: Supabase,
  habitId: string,
  save: ((checkinId: string) => Promise<{ error: { message?: string } | null }>) | null,
  lostCopy: (raw: string | undefined) => string,
): Promise<CheckInThenResult> {
  try {
    const { data, error } = await supabase.rpc("create_checkin", { p_habit_id: habitId });
    const row = data?.[0];
    if (error || !row) return { ok: false, error: checkinMessageFor(error?.message), checkedIn: false };
    if (save) {
      const { error: saveError } = await save(row.checkin_id);
      if (saveError) return { ok: false, error: lostCopy(saveError.message), checkedIn: true };
    }
    return { ok: true, checkinId: row.checkin_id, created: row.created };
  } catch {
    return { ok: false, error: CHECKIN_GENERIC, checkedIn: false };
  }
}

async function run(call: () => PromiseLike<{ error: { message?: string; code?: string } | null }>, copy: (e: { message?: string; code?: string }) => string, generic: string): Promise<LogResult> {
  try {
    const { error } = await call();
    return error ? { ok: false, error: copy(error) } : { ok: true };
  } catch {
    return { ok: false, error: generic };
  }
}

// ---- reading and books ----

export async function checkInWithReadingRpc(supabase: Supabase, habitId: string, entry: ReadingInput | null): Promise<CheckInThenResult> {
  if (entry) {
    const valid = checkReadingPages(entry);
    if (!valid.ok) return { ok: false, error: valid.error, checkedIn: false };
  }
  return checkInThen(
    supabase,
    habitId,
    entry ? (id) => Promise.resolve(supabase.rpc("save_reading_entry", readingArgs(id, entry))) : null,
    (raw) => readingMessageFor(raw, READING_LOST),
  );
}

/** Adds or replaces the reading of an existing check-in. Never touches the check-in. */
export async function saveReadingRpc(supabase: Supabase, checkinId: string, entry: ReadingInput): Promise<LogResult> {
  const valid = checkReadingPages(entry);
  if (!valid.ok) return valid;
  return run(() => supabase.rpc("save_reading_entry", readingArgs(checkinId, entry)), (e) => readingMessageFor(e.message), READING_GENERIC);
}

export async function deleteReadingRpc(supabase: Supabase, checkinId: string): Promise<LogResult> {
  return run(() => supabase.rpc("delete_reading_entry", { p_checkin_id: checkinId }), (e) => readingMessageFor(e.message), READING_GENERIC);
}

export async function createBookRpc(supabase: Supabase, userId: string, input: BookInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const valid = validateBook(input);
  if (!valid.ok) return valid;
  try {
    const { data, error } = await supabase
      .from("books")
      .insert({ user_id: userId, title: input.title.trim(), author: input.author === null ? null : input.author.trim(), total_pages: input.totalPages })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: readingMessageFor(error?.message) };
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, error: READING_GENERIC };
  }
}

// ---- cardio ----

export async function checkInWithCardioRpc(supabase: Supabase, habitId: string, entry: CardioInput | null): Promise<CheckInThenResult> {
  const valid = entry ? checkCardio(entry) : null;
  if (valid && !valid.ok) return { ok: false, error: valid.error, checkedIn: false };
  return checkInThen(
    supabase,
    habitId,
    entry && valid?.ok ? (id) => Promise.resolve(supabase.rpc("add_cardio_entry", { p_checkin_id: id, ...cardioFields(entry, valid.note) })) : null,
    (raw) => cardioMessageFor(raw, CARDIO_OUTING_LOST),
  );
}

/** One more outing on an existing check-in. */
export async function addCardioRpc(supabase: Supabase, checkinId: string, entry: CardioInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const valid = checkCardio(entry);
  if (!valid.ok) return valid;
  try {
    const { data, error } = await supabase.rpc("add_cardio_entry", { p_checkin_id: checkinId, ...cardioFields(entry, valid.note) });
    if (error || !data) return { ok: false, error: cardioMessageFor(error?.message) };
    return { ok: true, id: data };
  } catch {
    return { ok: false, error: cardioMessageFor(undefined) };
  }
}

export async function updateCardioRpc(supabase: Supabase, entryId: string, entry: CardioInput): Promise<LogResult> {
  const valid = checkCardio(entry);
  if (!valid.ok) return valid;
  return run(() => supabase.rpc("update_cardio_entry", { p_entry_id: entryId, ...cardioFields(entry, valid.note) }), (e) => cardioMessageFor(e.message), cardioMessageFor(undefined));
}

export async function deleteCardioRpc(supabase: Supabase, entryId: string): Promise<LogResult> {
  return run(() => supabase.rpc("delete_cardio_entry", { p_entry_id: entryId }), (e) => cardioMessageFor(e.message), cardioMessageFor(undefined));
}

export type CardioRecent = { id: string; kind: CardioKind; distanceM: number; durationS: number };

/** The outings of a check-in (edit and delete). */
export async function loadCardioOutingsRpc(supabase: Supabase, checkinId: string): Promise<CardioRecent[]> {
  try {
    const { data } = await supabase.from("cardio_entries").select("id,kind,distance_m,duration_s").eq("checkin_id", checkinId).order("created_at");
    return (data ?? []).filter((r) => CARDIO_KINDS.includes(r.kind as CardioKind)).map((r) => ({ id: r.id, kind: r.kind as CardioKind, distanceM: r.distance_m, durationS: r.duration_s }));
  } catch {
    return [];
  }
}

// ---- watch and titles ----

type TitleCheck = { ok: true } | { ok: false; error: string };

/** The full domain validation: the title is read through the caller's own client, so a foreign id is "not found". */
async function checkAgainstTitle(supabase: Supabase, entry: WatchInput): Promise<TitleCheck> {
  const shape = checkWatchShape(entry);
  if (!shape.ok) return shape;
  const { data: m } = await supabase.from("media_items").select("id,title,kind,total_seasons,total_episodes,runtime_min").eq("id", entry.mediaId).maybeSingle();
  if (!m) return { ok: false, error: WATCH_ERRORS.media_not_found };
  const kind = m.kind === "movie" ? "movie" : "series";
  return validateWatchInput(
    kind,
    { episodes: entry.episodes, season: entry.season, episodeTo: entry.episodeTo, minutes: entry.minutes, completed: entry.completed },
    { id: m.id, title: m.title, kind, totalSeasons: m.total_seasons, totalEpisodes: m.total_episodes, runtimeMin: m.runtime_min, status: "watching", finishedOn: null },
  );
}

export async function checkInWithWatchRpc(supabase: Supabase, habitId: string, entry: WatchInput | null): Promise<CheckInThenResult> {
  if (entry) {
    try {
      const valid = await checkAgainstTitle(supabase, entry);
      if (!valid.ok) return { ok: false, error: valid.error, checkedIn: false };
    } catch {
      return { ok: false, error: WATCH_GENERIC, checkedIn: false };
    }
  }
  return checkInThen(
    supabase,
    habitId,
    entry ? (id) => Promise.resolve(supabase.rpc("save_watch_entry", watchArgs(id, entry))) : null,
    (raw) => watchMessageFor(raw, WATCH_LOST),
  );
}

export async function saveWatchRpc(supabase: Supabase, checkinId: string, entry: WatchInput): Promise<LogResult> {
  try {
    const valid = await checkAgainstTitle(supabase, entry);
    if (!valid.ok) return valid;
  } catch {
    return { ok: false, error: WATCH_GENERIC };
  }
  return run(() => supabase.rpc("save_watch_entry", watchArgs(checkinId, entry)), (e) => watchMessageFor(e.message), WATCH_GENERIC);
}

export async function deleteWatchRpc(supabase: Supabase, checkinId: string): Promise<LogResult> {
  return run(() => supabase.rpc("delete_watch_entry", { p_checkin_id: checkinId }), (e) => watchMessageFor(e.message), WATCH_GENERIC);
}

export async function createMediaRpc(supabase: Supabase, userId: string, input: MediaInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const valid = validateMedia(input);
  if (!valid.ok) return valid;
  try {
    const { data, error } = await supabase
      .from("media_items")
      .insert({ user_id: userId, title: input.title.trim(), kind: input.kind, total_seasons: input.totalSeasons, total_episodes: input.totalEpisodes, runtime_min: input.runtimeMin })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: watchMessageFor(error?.message) };
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, error: WATCH_GENERIC };
  }
}

/** The titles you are watching, the newest first (for the picker). */
export async function loadMediaRpc(supabase: Supabase, userId: string): Promise<MediaItem[]> {
  try {
    const { data } = await supabase
      .from("media_items")
      .select("id,title,kind,total_seasons,total_episodes,runtime_min,status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    return (data ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      kind: m.kind === "movie" ? "movie" : "series",
      totalSeasons: m.total_seasons,
      totalEpisodes: m.total_episodes,
      runtimeMin: m.runtime_min,
      status: m.status === "finished" ? "finished" : "watching",
      finishedOn: null,
    }));
  } catch {
    return [];
  }
}

// ---- workout and exercises ----

export async function saveWorkoutRpc(supabase: Supabase, checkinId: string, draft: WorkoutDraft): Promise<LogResult> {
  const valid = validateWorkoutDraft(draft);
  if (!valid.ok) return valid;
  return run(
    () => supabase.rpc("save_workout", { p_checkin_id: checkinId, p_day_types: draft.dayTypes, p_sets: toSetsPayload(draft) }),
    workoutMessageFor,
    WORKOUT_GENERIC,
  );
}

export async function deleteWorkoutRpc(supabase: Supabase, checkinId: string): Promise<LogResult> {
  return run(() => supabase.rpc("delete_workout", { p_checkin_id: checkinId }), workoutMessageFor, WORKOUT_GENERIC);
}

export async function createExerciseRpc(supabase: Supabase, userId: string, input: { name: string; group: MuscleGroup }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = validateExerciseName(input.name);
  if (!name.ok) return name;
  if (!MUSCLE_GROUPS.includes(input.group)) return { ok: false, error: "Elige un grupo muscular." };
  try {
    const { data, error } = await supabase.from("exercises").insert({ user_id: userId, name: name.name, muscle_group: input.group }).select("id").single();
    if (error || !data) return { ok: false, error: error ? workoutMessageFor(error) : WORKOUT_GENERIC };
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, error: WORKOUT_GENERIC };
  }
}

/** The catalog plus your own exercises, by name. */
export async function loadExercisesRpc(supabase: Supabase, userId: string): Promise<ExerciseRef[]> {
  try {
    const { data } = await supabase.from("exercises").select("id,name,muscle_group").or(`user_id.is.null,user_id.eq.${userId}`).is("archived_at", null).order("name").order("id");
    return (data ?? []).filter((e) => MUSCLE_GROUPS.includes(e.muscle_group as MuscleGroup)).map((e) => ({ id: e.id, name: e.name, group: e.muscle_group as MuscleGroup }));
  } catch {
    return [];
  }
}
