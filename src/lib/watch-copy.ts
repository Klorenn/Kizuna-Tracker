import type { Database } from "@/lib/supabase/database.types";

/** Spanish copy and checks of the watch actions. Pure: shared by the web server actions and the native app. */
export type WatchInput = {
  mediaId: string;
  episodes: number | null;
  season: number | null;
  episodeTo: number | null;
  minutes: number | null;
  completed: boolean;
  finished: boolean;
};

export const WATCH_GENERIC = "No pudimos guardar los cambios. Inténtalo de nuevo.";
export const WATCH_LOST = "Marcamos el hábito, pero no guardamos lo que viste. Inténtalo de nuevo.";
export const WATCH_FUTURE = "La fecha no puede ser futura.";
export const WATCH_NOT_AUTHENTICATED = "Inicia sesión para continuar.";
export const MOVIE_NEEDS = "Indica los minutos o marca que la viste completa.";

export const WATCH_ERRORS: Record<string, string> = {
  invalid_watch: "Revisa lo que viste: episodios, temporada o minutos.",
  media_not_found: "No encontramos ese título.",
  log_type_mismatch: "Este hábito no lleva ese tipo de registro.",
  checkin_not_found: "Ese día no tiene check-in.",
  invalid_finished_on: WATCH_FUTURE,
  // same copy as registros/actions.ts and habitos/actions.ts
  habit_not_found: "No encontramos ese hábito.",
  photo_required: "Este hábito pide una foto de prueba.",
  habit_has_items: "Este hábito se completa marcando sus pasos.",
  not_authenticated: WATCH_NOT_AUTHENTICATED,
};

export function watchMessageFor(raw: string | undefined, fallback = WATCH_GENERIC): string {
  if (!raw) return fallback;
  const key = Object.keys(WATCH_ERRORS).find((k) => raw.includes(k));
  return key ? WATCH_ERRORS[key] : fallback;
}

/**
 * What the database repeats without knowing the title's kind: an entry with no episodes, no minutes and not
 * completed is a movie missing its data (a series always has episodes).
 */
export function checkWatchShape(entry: WatchInput): { ok: true } | { ok: false; error: string } {
  if (entry.episodes === null && entry.minutes === null && !entry.completed) return { ok: false, error: MOVIE_NEEDS };
  return { ok: true };
}

// The generated types mark every argument of save_watch_entry as non-null; the SQL accepts null for
// episodes, season, episode and minutes (a movie has no episodes), so the nulls are cast through (one cast: a wrong key still fails to compile).
export type SaveWatchArgs = Database["public"]["Functions"]["save_watch_entry"]["Args"];

export function watchArgs(checkinId: string, entry: WatchInput): SaveWatchArgs {
  return {
    p_checkin_id: checkinId,
    p_media_id: entry.mediaId,
    p_episodes: entry.episodes,
    p_season: entry.season,
    p_episode_to: entry.episodeTo,
    p_minutes: entry.minutes,
    p_completed: entry.completed,
    p_finished: entry.finished,
  } as SaveWatchArgs;
}
