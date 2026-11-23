import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDuration } from "@/domain/time";
import { nextEpisodeHint, type MediaKind } from "@/domain/watch";
import type { Database } from "@/lib/supabase/database.types";

/** A title chip in the watch sheet, with where to continue it (from its latest entry). */
export type PickerMedia = {
  id: string;
  title: string;
  kind: MediaKind;
  totalSeasons: number | null;
  totalEpisodes: number | null;
  runtimeMin: number | null;
  /** season of the latest entry (series), to prefill */
  hintSeason: number | null;
  /** last episode reached (series), to prefill "hasta el ep." */
  hintEpisodeTo: number | null;
};

type MediaRow = {
  id: string;
  title: string;
  kind: string;
  total_seasons: number | null;
  total_episodes: number | null;
  runtime_min: number | null;
  status: string;
  created_at: string;
};
type EntryRow = { media_id: string; local_date: string; season: number | null; episode_to: number | null };

/**
 * Titles you are watching, the last one you logged first (then the newest). `keep` also lists that
 * title when it is finished (editing an old entry).
 */
export function pickerMedia(media: MediaRow[], entries: EntryRow[], keep?: string): PickerMedia[] {
  const lastUsed = new Map<string, string>();
  for (const e of entries) {
    const prev = lastUsed.get(e.media_id);
    if (!prev || e.local_date > prev) lastUsed.set(e.media_id, e.local_date);
  }
  const asEntries = entries.map((e) => ({
    date: e.local_date,
    mediaId: e.media_id,
    episodes: null,
    season: e.season,
    episodeTo: e.episode_to,
    minutes: null,
    completed: false,
  }));
  return media
    .filter((m) => m.status === "watching" || m.id === keep)
    .sort((a, b) => {
      if (a.id === keep) return -1;
      if (b.id === keep) return 1;
      const la = lastUsed.get(a.id) ?? "";
      const lb = lastUsed.get(b.id) ?? "";
      if (la !== lb) return la > lb ? -1 : 1;
      return a.created_at > b.created_at ? -1 : 1;
    })
    .map((m) => {
      const hint = nextEpisodeHint(asEntries, m.id);
      return {
        id: m.id,
        title: m.title,
        kind: m.kind === "movie" ? "movie" : "series",
        totalSeasons: m.total_seasons,
        totalEpisodes: m.total_episodes,
        runtimeMin: m.runtime_min,
        hintSeason: hint.season,
        hintEpisodeTo: hint.episodeTo,
      };
    });
}

async function readPicker(supabase: SupabaseClient<Database>, userId: string) {
  const [media, entries] = await Promise.all([
    supabase
      .from("media_items")
      .select("id,title,kind,total_seasons,total_episodes,runtime_min,status,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("watch_entries")
      .select("media_id,local_date,season,episode_to")
      .eq("user_id", userId)
      .order("local_date", { ascending: false })
      .limit(500),
  ]);
  return { media: media.data ?? [], entries: entries.data ?? [], ok: !media.error && !entries.error };
}

/** Titles and recent entries for the picker (bounded: the last 500 entries decide order and hints). */
export async function loadPickerMedia(
  supabase: SupabaseClient<Database>,
  userId: string,
  keep?: string,
): Promise<PickerMedia[]> {
  const r = await readPicker(supabase, userId);
  return pickerMedia(r.media, r.entries, keep);
}

/** Same titles, or null when a read failed (an empty chip list would pass for "no titles yet"). */
export async function loadPickerMediaOrNull(
  supabase: SupabaseClient<Database>,
  userId: string,
  keep?: string,
): Promise<PickerMedia[] | null> {
  const r = await readPicker(supabase, userId);
  return r.ok ? pickerMedia(r.media, r.entries, keep) : null;
}

/** Confirmation copy before deleting a title: "Se borrarán 4 registros (5 episodios, 3 h 10 min). Tus check-ins no cambian." */
export function mediaDeleteCopy(records: number, episodes: number, minutes: number): string {
  if (records === 0) return "El título no tiene registros. Tus check-ins no cambian.";
  const head = records === 1 ? "Se borrará 1 registro" : `Se borrarán ${records} registros`;
  const parts: string[] = [];
  if (episodes > 0) parts.push(episodes === 1 ? "1 episodio" : `${episodes} episodios`);
  if (minutes > 0) parts.push(formatDuration(minutes));
  return `${head}${parts.length ? ` (${parts.join(", ")})` : ""}. Tus check-ins no cambian.`;
}
