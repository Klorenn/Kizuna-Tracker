"use server";

import { revalidatePath } from "next/cache";
import { localDate } from "@/domain/dates";
import type { LocalDate } from "@/domain/types";
import { validateMedia, validateWatchInput, type MediaInput } from "@/domain/watch";
import { isLocalDate } from "@/lib/log-date";
import { requireUser } from "@/lib/require-user";
import {
  WATCH_ERRORS,
  WATCH_FUTURE,
  WATCH_LOST,
  WATCH_NOT_AUTHENTICATED,
  checkWatchShape,
  watchArgs,
  watchMessageFor,
  type WatchInput,
} from "@/lib/watch-copy";
import type { createServerClient } from "@/lib/supabase/server";
import { loggedCoverage } from "@/lib/watch-coverage";

// Series and movies: the titles library and the watch entry of a check-in. Every write of an
// entry goes through the RPCs of 0018; titles use their own table with column grants.

type Result = { ok: true } | { ok: false; error: string };

const FUTURE = WATCH_FUTURE;
const NOT_AUTHENTICATED = WATCH_NOT_AUTHENTICATED;
const ERRORS = WATCH_ERRORS;
const messageFor = watchMessageFor;

function refresh() {
  revalidatePath("/");
  revalidatePath("/series");
  revalidatePath("/habitos/[id]", "page");
  revalidatePath("/habitos/[id]/visto", "page");
}

const checkShape = checkWatchShape;

type Client = Awaited<ReturnType<typeof createServerClient>>;

/**
 * The full domain validation, server side: the title is read through the caller's own client
 * (owner-only RLS), so a foreign or deleted id is "not found". The RPC repeats the shape checks but
 * not the title's totals.
 */
async function checkAgainstTitle(supabase: Client, entry: WatchInput): Promise<Result> {
  const shape = checkShape(entry);
  if (!shape.ok) return shape;
  const { data: m } = await supabase
    .from("media_items")
    .select("id,title,kind,total_seasons,total_episodes,runtime_min")
    .eq("id", entry.mediaId)
    .maybeSingle();
  if (!m) return { ok: false, error: ERRORS.media_not_found };
  return validateWatchInput(
    m.kind === "movie" ? "movie" : "series",
    {
      episodes: entry.episodes,
      season: entry.season,
      episodeTo: entry.episodeTo,
      minutes: entry.minutes,
      completed: entry.completed,
    },
    {
      id: m.id,
      title: m.title,
      kind: m.kind === "movie" ? "movie" : "series",
      totalSeasons: m.total_seasons,
      totalEpisodes: m.total_episodes,
      runtimeMin: m.runtime_min,
      status: "watching",
      finishedOn: null,
    },
  );
}

/**
 * "Guardar" / "Solo marcar" in the watch sheet on Hoy: checks the habit in (create_checkin) and, with an
 * entry, saves what you watched on that check-in. When the entry fails the habit stays checked
 * (`checkedIn: true`) so the sheet can say so and retry with saveWatch.
 */
export async function checkInWithWatch(
  habitId: string,
  entry: WatchInput | null,
): Promise<{ ok: true; checkinId: string; created: boolean } | { ok: false; error: string; checkedIn: boolean }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error, checkedIn: false };
  const { supabase } = auth;
  if (entry) {
    const valid = await checkAgainstTitle(supabase, entry);
    if (!valid.ok) return { ok: false, error: valid.error, checkedIn: false };
  }
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
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const valid = await checkAgainstTitle(supabase, entry);
  if (!valid.ok) return valid;
  const { error } = await supabase.rpc("save_watch_entry", watchArgs(checkinId, entry));
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

export async function deleteWatch(checkinId: string): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase.rpc("delete_watch_entry", { p_checkin_id: checkinId });
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

export async function createMedia(input: MediaInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, userId: uid } = auth;
  const valid = validateMedia(input);
  if (!valid.ok) return valid;
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
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const { data: current } = await supabase.from("media_items").select("kind").eq("id", id).maybeSingle();
  if (!current) return { ok: false, error: ERRORS.media_not_found };
  const kind = current.kind === "movie" ? "movie" : "series";
  const valid = validateMedia({ ...input, kind });
  if (!valid.ok) return valid;
  if (kind === "series") {
    // totals must still cover what is logged: distinct episodes (a rewatch adds nothing), highest season
    const { data: logged } = await supabase
      .from("watch_entries")
      .select("episodes,season,episode_to")
      .eq("media_id", id);
    const { episodes, season } = loggedCoverage(logged ?? []);
    if (input.totalEpisodes !== null && input.totalEpisodes < episodes) {
      return { ok: false, error: `Ya registraste ${episodes} episodios: el total no puede ser menor.` };
    }
    if (input.totalSeasons !== null && input.totalSeasons < season) {
      return { ok: false, error: `Ya registraste la temporada ${season}: el total no puede ser menor.` };
    }
  }
  const { data, error } = await supabase
    .from("media_items")
    .update({
      title: input.title.trim(),
      total_seasons: input.totalSeasons,
      total_episodes: input.totalEpisodes,
      runtime_min: input.runtimeMin,
    })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: messageFor(error.message) };
  if (!data || data.length === 0) return { ok: false, error: ERRORS.media_not_found };
  refresh();
  return { ok: true };
}

/** Finished on a local date (never after today in the profile's zone), or back to "watching" with null. */
export async function setMediaFinished(id: string, finishedOn: LocalDate | null): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, userId: uid } = auth;
  if (finishedOn !== null) {
    if (!isLocalDate(finishedOn)) return { ok: false, error: "Elige una fecha válida." };
    // the profiles SELECT policy is owner-only (public data lives in public_profiles); the explicit id filter keeps the read to the caller's own row
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", uid).maybeSingle();
    if (!profile) return { ok: false, error: NOT_AUTHENTICATED };
    if (finishedOn > localDate(new Date(), profile.timezone)) return { ok: false, error: FUTURE };
  }
  const { data, error } = await supabase
    .from("media_items")
    .update({ status: finishedOn ? "finished" : "watching", finished_on: finishedOn })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: messageFor(error.message) };
  if (!data || data.length === 0) return { ok: false, error: ERRORS.media_not_found };
  refresh();
  return { ok: true };
}

/** Deletes the title; its watch entries go with it (cascade). Check-ins never change. */
export async function deleteMedia(id: string): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data, error } = await auth.supabase.from("media_items").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: messageFor(error.message) };
  if (!data || data.length === 0) return { ok: false, error: ERRORS.media_not_found };
  refresh();
  return { ok: true };
}
