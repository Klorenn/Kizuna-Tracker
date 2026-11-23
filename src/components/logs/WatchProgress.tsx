import { CaretRight, Television } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { logEntryHref } from "@/components/logs/DayLogDetail";
import { ProgressStat, TodayEntryLink, progressLink } from "@/components/logs/ReadingProgress";
import { Card } from "@/components/ui/Card";
import { monthTitle, shiftMonth, type MonthKey } from "@/domain/calendar";
import type { LocalDate } from "@/domain/types";
import { monthlyWatch, seriesProgress, type MediaItem, type WatchEntry } from "@/domain/watch";

/** The series being watched: the one with the latest entry, else the newest "viendo" series. */
export function currentSeries(media: MediaItem[], entries: WatchEntry[]): MediaItem | null {
  const watching = media.filter((m) => m.kind === "series" && m.status === "watching");
  if (watching.length === 0) return null;
  const last = new Map<string, string>();
  for (const e of entries) if ((last.get(e.mediaId) ?? "") < e.date) last.set(e.mediaId, e.date);
  return [...watching].sort((a, b) => (last.get(b.id) ?? "").localeCompare(last.get(a.id) ?? ""))[0];
}

/**
 * Habit detail > PROGRESO for a series and movies habit: movies and episodes of the month
 * against the last, the series in progress ("Viendo: Dark · 5 de 26 episodios") and the links.
 */
export function WatchProgress({
  habitId,
  month,
  today,
  media,
  entries,
  todayEntry,
}: {
  habitId: string;
  month: MonthKey;
  today: LocalDate;
  media: MediaItem[];
  entries: WatchEntry[];
  /** Today's check-in and whether it already has a title; null without a check-in today. */
  todayEntry: { logged: boolean } | null;
}) {
  const prevMonth = shiftMonth(month, -1);
  const prevName = monthTitle(prevMonth).name;
  const now = monthlyWatch(entries, media, month);
  const prev = monthlyWatch(entries, media, prevMonth);
  const series = currentSeries(media, entries);

  return (
    <Card>
      <div className="flex gap-3 p-4">
        <ProgressStat label="Películas este mes" value={now.movies} caption={`${prevName}: ${prev.movies}`} />
        <ProgressStat label="Episodios este mes" value={now.episodes} caption={`${prevName}: ${prev.episodes}`} />
      </div>
      {series ? (
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <Television size={20} weight="light" aria-hidden className="shrink-0 text-ink" />
          <div className="min-w-0 flex-1">
            <p className="text-small text-muted">Viendo</p>
            <p className="break-words text-body text-ink">
              {series.title} · <span className="font-mono text-small">{seriesProgress(entries, series)}</span>
            </p>
          </div>
        </div>
      ) : null}
      {todayEntry ? <TodayEntryLink href={logEntryHref(habitId, "watch", today)} logged={todayEntry.logged} /> : null}
      <Link href="/series" className={progressLink}>
        <span className="flex-1">Series y películas</span>
        <CaretRight size={18} weight="light" aria-hidden className="text-muted" />
      </Link>
      <Link href="/resumen/series" className={progressLink}>
        <span className="flex-1">Ver series por mes</span>
        <CaretRight size={18} weight="light" aria-hidden className="text-muted" />
      </Link>
    </Card>
  );
}
