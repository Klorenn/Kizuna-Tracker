import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/ui/TopBar";
import { localDate } from "@/domain/dates";
import { formatDuration } from "@/domain/time";
import { entryMinutes, episodeLabel, seriesProgress, type MediaItem, type WatchEntry } from "@/domain/watch";
import { fetchAll } from "@/lib/paginate";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionUser, getViewerProfile } from "@/lib/viewer";
import { SeriesView, type MediaView } from "./SeriesView";

export const metadata: Metadata = { title: "Series y películas" };

export default async function SeriesPage() {
  const supabase = await createServerClient();
  const user = await getSessionUser();
  if (!user) redirect("/bienvenida");
  const profile = await getViewerProfile();
  if (!profile) redirect("/login?error=perfil");

  const [media, rows] = await Promise.all([
    supabase
      .from("media_items")
      .select("id,title,kind,total_seasons,total_episodes,runtime_min,status,finished_on,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500),
    // one entry per check-in: a few thousand rows over years, read page by page
    fetchAll((from, to) =>
      supabase
        .from("watch_entries")
        .select("id,media_id,local_date,episodes,season,episode_to,minutes,completed")
        .eq("user_id", user.id)
        .order("local_date")
        .order("id")
        .range(from, to),
    ),
  ]);

  const items: MediaItem[] = (media.data ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    kind: m.kind === "movie" ? "movie" : "series",
    totalSeasons: m.total_seasons,
    totalEpisodes: m.total_episodes,
    runtimeMin: m.runtime_min,
    status: m.status === "finished" ? "finished" : "watching",
    finishedOn: m.finished_on,
  }));
  const entries: WatchEntry[] = rows.map((e) => ({
    date: e.local_date,
    mediaId: e.media_id,
    episodes: e.episodes,
    season: e.season,
    episodeTo: e.episode_to,
    minutes: e.minutes,
    completed: e.completed,
  }));

  const view: MediaView[] = items.map((m) => {
    const mine = entries.filter((e) => e.mediaId === m.id);
    // the latest entry says where to continue (entries are in date order)
    const last = mine.at(-1);
    const label = last ? episodeLabel(last.season, last.episodeTo) : null;
    const summary =
      m.kind === "movie"
        ? m.runtimeMin
          ? formatDuration(m.runtimeMin)
          : "Película"
        : [seriesProgress(entries, m), label].filter(Boolean).join(" · ");
    return {
      ...m,
      summary,
      records: mine.length,
      episodes: mine.reduce((n, e) => n + (e.episodes ?? 0), 0),
      minutes: mine.reduce((n, e) => n + entryMinutes(e, m), 0),
    };
  });

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <TopBar backHref="/" />
      <h1 className="text-display font-semibold text-ink">Series y películas</h1>
      <SeriesView media={view} today={localDate(new Date(), profile.timezone)} />
    </main>
  );
}
