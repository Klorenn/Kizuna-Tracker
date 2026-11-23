import type { Metadata } from "next";
import Link from "next/link";
import { ComparisonBars } from "@/components/charts/ComparisonBars";
import { WeekBars } from "@/components/charts/WeekBars";
import { MonthStepper } from "@/components/logs/MonthStepper";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { dayLabel, monthOf, shiftMonth } from "@/domain/calendar";

import { lastMonths } from "@/domain/logs";
import { weeklyTotals } from "@/domain/time";
import { entryMinutes, monthlyWatch, watchSeries } from "@/domain/watch";
import { loadWatchData, watchLine } from "@/lib/logs-data";
import { RangeToggle } from "../RangeToggle";
import {
  DetailHeader,
  Stat,
  colorOf,
  compactNumber,
  dataFrom,
  loadLogsContext,
  monthName,
  parseRange,
  resolveMonth,
  stepper,
} from "../logs-view";

export const metadata: Metadata = { title: "Series y películas" };

export default async function SeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string | string[]; rango?: string | string[] }>;
}) {
  const { mes, rango } = await searchParams;
  const ctx = await loadLogsContext();
  const month = resolveMonth(mes, ctx.current);
  const range = parseRange(rango);
  const { media, entries } = await loadWatchData(ctx.supabase, ctx.userId, dataFrom(month, range));
  const habit = ctx.watchHabit;
  const color = colorOf(habit);

  const now = monthlyWatch(entries, media, month);
  const prev = monthlyWatch(entries, media, shiftMonth(month, -1));
  const series = watchSeries(entries, media, lastMonths(month, range));
  const weeks = weeklyTotals(
    entries.map((e) => ({ date: e.date, value: e.episodes ?? 0 })),
    month,
  );
  const byId = new Map(media.map((m) => [m.id, m]));
  const list = entries
    .filter((e) => monthOf(e.date) === month)
    .sort((a, b) => b.date.localeCompare(a.date));
  const finished = media
    .filter((m) => m.status === "finished" && m.finishedOn !== null && monthOf(m.finishedOn) === month)
    .sort((a, b) => (a.finishedOn as string).localeCompare(b.finishedOn as string));
  const nav = stepper("/resumen/series", month, ctx.current, range);
  const prevName = monthName(shiftMonth(month, -1));

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <DetailHeader title="Series y películas" />
      <MonthStepper month={month} {...nav} />

      <Card className="flex gap-3 p-4">
        <Stat label="Películas" value={now.movies} caption={`${prevName}: ${prev.movies}`} />
        <Stat label="Episodios" value={now.episodes} caption={`${prevName}: ${prev.episodes}`} />
        <Stat label="Días" value={now.days} caption={`${prevName}: ${prev.days}`} />
      </Card>

      <RangeToggle value={range} />

      <SectionHeader label="Películas por mes" />
      <Card className="p-4">
        <ComparisonBars
          data={series.map((s) => ({ month: s.month, value: s.movies }))}
          color={color}
          format={compactNumber}
          label="Películas terminadas por mes"
          current={month}
        />
      </Card>

      <SectionHeader label="Episodios por mes" />
      <Card className="p-4">
        <ComparisonBars
          data={series.map((s) => ({ month: s.month, value: s.episodes }))}
          color={color}
          format={compactNumber}
          label="Episodios por mes"
          current={month}
        />
      </Card>

      <SectionHeader label={`Episodios de ${monthName(month).toLowerCase()} por semana`} />
      <Card className="p-4">
        <WeekBars data={weeks} color={color} format={compactNumber} label="Episodios por semana" />
      </Card>

      <SectionHeader label="Terminadas" action="Series y películas" href="/series" />
      <Card className="p-4">
        {finished.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {finished.map((m) => (
              <li key={m.id} className="flex items-baseline gap-2 text-body text-ink">
                <span className="min-w-0 flex-1 break-words">{m.title}</span>
                <span className="shrink-0 text-small text-muted">{m.kind === "movie" ? "Película" : "Serie"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-muted">Ningún título terminado este mes.</p>
        )}
      </Card>

      <SectionHeader label="Registros del mes" />
      {list.length > 0 ? (
        <Card>
          <ul className="flex flex-col">
            {list.map((e, i) => {
              const m = byId.get(e.mediaId);
              return (
                <li key={`${e.date}-${i}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-body text-ink">
                      {watchLine({
                        kind: "watch",
                        title: m?.title ?? "Título",
                        mediaKind: m?.kind ?? (e.episodes !== null ? "series" : "movie"),
                        episodes: e.episodes,
                        season: e.season,
                        episodeTo: e.episodeTo,
                        minutes: entryMinutes(e, m),
                        completed: e.completed,
                      })}
                    </p>
                    <p className="text-small text-muted">{dayLabel(e.date)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <Card>
          <EmptyState
            title="Todavía no hay series ni películas este mes."
            body="Cuando registres qué viste, lo verás aquí."
            action={
              habit ? (
                <Link href={`/habitos/${habit.id}`} className="inline-flex h-11 items-center text-small font-medium text-accent">
                  Ir al hábito
                </Link>
              ) : undefined
            }
          />
        </Card>
      )}
    </main>
  );
}
