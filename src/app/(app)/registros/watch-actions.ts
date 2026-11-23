"use server";

import { revalidatePath } from "next/cache";
import { localDate } from "@/domain/dates";
import type { LocalDate } from "@/domain/types";
import { validateMedia, type MediaInput } from "@/domain/watch";
import { isLocalDate } from "@/lib/log-date";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

// Series and movies: the titles library and the watch entry of a check-in. Every write of an
// entry goes through the RPCs of 0018; titles use their own table with column grants.

export type WatchInput = {
  mediaId: string;
  episodes: number | null;
  season: number | null;
  episodeTo: number | null;
  minutes: number | null;
  completed: boolean;
  finished: boolean;
};
type Result = { ok: true } | { ok: false; error: string };

const GENERIC = "No pudimos guardar los cambios. Inténtalo de nuevo.";
const WATCH_LOST = "Marcamos el hábito, pero no guardamos lo que viste. Inténtalo de nuevo.";
const FUTURE = "La fecha no puede ser futura.";
const NOT_AUTHENTICATED = "Inicia sesión para continuar.";
const MOVIE_NEEDS = "Indica los minutos o marca que la viste completa.";
const ERRORS: Record<string, string> = {
  invalid_watch: "Revisa lo que viste: episodios, temporada o minutos.",
  media_not_found: "No encontramos ese título.",
  log_type_mismatch: "Este hábito no lleva ese tipo de registro.",
  checkin_not_found: "Ese día no tiene check-in.",
  invalid_finished_on: FUTURE,
  // same copy as registros/actions.ts and habitos/actions.ts
  habit_not_found: "No encontramos ese hábito.",
  photo_required: "Este hábito pide una foto de prueba.",
  habit_has_items: "Este hábito se completa marcando sus pasos.",
  not_authenticated: NOT_AUTHENTICATED,
};

function messageFor(raw: string | undefined, fallback = GENERIC): string {
  if (!raw) return fallback;
  const key = Object.keys(ERRORS).find((k) => raw.includes(k));
  return key ? ERRORS[key] : fallback;
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/series");
  revalidatePath("/habitos/[id]", "page");
  revalidatePath("/habitos/[id]/visto", "page");
}

/**
 * What the database repeats without knowing the title's kind: an entry with no episodes, no
 * minutes and not completed is a movie missing its data (a series always has episodes). The sheet
 * runs the full `validateWatchInput` with the title at hand; the RPC stays the authority.
 */
function checkShape(entry: WatchInput): Result {
  if (entry.episodes === null && entry.minutes === null && !entry.completed) return { ok: false, error: MOVIE_NEEDS };
  return { ok: true };
}

// The generated types mark every argument of save_watch_entry as non-null; the SQL accepts null for
// episodes, season, episode and minutes (a movie has no episodes), so the nulls are cast through.
type SaveWatchArgs = Database["public"]["Functions"]["save_watch_entry"]["Args"];

function watchArgs(checkinId: string, entry: WatchInput): SaveWatchArgs {
  return {
    p_checkin_id: checkinId,
    p_media_id: entry.mediaId,
    p_episodes: entry.episodes,
    p_season: entry.season,
    p_episode_to: entry.episodeTo,
    p_minutes: entry.minutes,
    p_completed: entry.completed,
    p_finished: entry.finished,
  } as unknown as SaveWatchArgs;
}

/**
 * "Guardar" / "Omitir" in the watch sheet on Hoy: checks the habit in (create_checkin) and, with an
 * entry, saves what you watched on that check-in. When the entry fails the habit stays checked
 * (`checkedIn: true`) so the sheet can say so and retry with saveWatch.
 */
export async function checkInWithWatch(
  habitId: string,
  entry: WatchInput | null,
): Promise<{ ok: true; checkinId: string; created: boolean } | { ok: false; error: string; checkedIn: boolean }> {
  if (entry) {
    const valid = checkShape(entry);
    if (!valid.ok) return { ok: false, error: valid.error, checkedIn: false };
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_checkin", { p_habit_id: habitId });
  const row = data?.[0];
  if (error || !row) return { ok: false, error: messageFor(error?.message), checkedIn: false };
  if (entry) {
    const { error: watchError } = await supabase.rpc("save_watch_entry", watchArgs(row.checkin_id, entry));
    if (watchError) {
      refresh();
      return { ok: false, error: messageFor(watchError.message, WATCH_LOST), checkedIn: true };
    }
  }
  refresh();
  return { ok: true, checkinId: row.checkin_id, created: row.created };
}

/** Adds or replaces the watch entry of an existing check-in (edit mode, any day). Never touches the check-in. */
export async function saveWatch(checkinId: string, entry: WatchInput): Promise<Result> {
  const valid = checkShape(entry);
  if (!valid.ok) return valid;
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("save_watch_entry", watchArgs(checkinId, entry));
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

export async function deleteWatch(checkinId: string): Promise<Result> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("delete_watch_entry", { p_checkin_id: checkinId });
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

export async function createMedia(input: MediaInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const valid = validateMedia(input);
  if (!valid.ok) return valid;
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { ok: false, error: NOT_AUTHENTICATED };
  const { data, error } = await supabase
    .from("media_items")
    .insert({
      user_id: uid,
      title: input.title.trim(),
      kind: input.kind,
      total_seasons: input.totalSeasons,
      total_episodes: input.totalEpisodes,
      runtime_min: input.runtimeMin,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: messageFor(error?.message) };
  refresh();
  return { ok: true, id: data.id };
}

/** The kind never changes: it is read from the row so the right shape is validated. */
export async function updateMedia(id: string, input: Omit<MediaInput, "kind">): Promise<Result> {
  const supabase = await createServerClient();
  const { data: current } = await supabase.from("media_items").select("kind").eq("id", id).maybeSingle();
  if (!current) return { ok: false, error: ERRORS.media_not_found };
  const kind = current.kind === "movie" ? "movie" : "series";
  const valid = validateMedia({ ...input, kind });
  if (!valid.ok) return valid;
  const { error } = await supabase
    .from("media_items")
    .update({
      title: input.title.trim(),
      total_seasons: input.totalSeasons,
      total_episodes: input.totalEpisodes,
      runtime_min: input.runtimeMin,
    })
    .eq("id", id);
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

/** Finished on a local date (never after today in the profile's zone), or back to "watching" with null. */
export async function setMediaFinished(id: string, finishedOn: LocalDate | null): Promise<Result> {
  const supabase = await createServerClient();
  if (finishedOn !== null) {
    if (!isLocalDate(finishedOn)) return { ok: false, error: "Elige una fecha válida." };
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return { ok: false, error: NOT_AUTHENTICATED };
    // own row only: friends' profiles are readable too, so never rely on .single() alone
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", uid).maybeSingle();
    if (!profile) return { ok: false, error: NOT_AUTHENTICATED };
    if (finishedOn > localDate(new Date(), profile.timezone)) return { ok: false, error: FUTURE };
  }
  const { error } = await supabase
    .from("media_items")
    .update({ status: finishedOn ? "finished" : "watching", finished_on: finishedOn })
    .eq("id", id);
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

/** Deletes the title; its watch entries go with it (cascade). Check-ins never change. */
export async function deleteMedia(id: string): Promise<Result> {
  const supabase = await createServerClient();
  const { error } = await supabase.from("media_items").delete().eq("id", id);
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}
