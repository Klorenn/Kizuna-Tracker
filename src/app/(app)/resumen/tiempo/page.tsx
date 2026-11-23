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
import { formatDuration, monthlyTime, timeSeries, weeklyTotals } from "@/domain/time";
import { loadTimeData } from "@/lib/logs-data";
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

export const metadata: Metadata = { title: "Tiempo" };

/** Bar labels in hours with one decimal: 310 min → "5,2 h". */
const hours = (min: number) => `${compactNumber(Math.round(min / 6) / 10)} h`;

export default async function TiempoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string | string[]; rango?: string | string[] }>;
}) {
  const { mes, rango } = await searchParams;
  const ctx = await loadLogsContext();
  const month = resolveMonth(mes, ctx.current);
  const range = parseRange(rango);
  const entries = await loadTimeData(ctx.supabase, ctx.userId, dataFrom(month, range));
  const habit = ctx.timeHabit;
  const color = colorOf(habit);

  const now = monthlyTime(entries, month);
  const prev = monthlyTime(entries, shiftMonth(month, -1));
  const series = timeSeries(entries, lastMonths(month, range));
  const weeks = weeklyTotals(
    entries.map((e) => ({ date: e.date, value: e.minutes })),
    month,
  );
  const list = entries
    .filter((e) => monthOf(e.date) === month)
    .sort((a, b) => b.date.localeCompare(a.date));
  const nav = stepper("/resumen/tiempo", month, ctx.current, range);
  const prevName = monthName(shiftMonth(month, -1));

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <DetailHeader title="Tiempo" />
      <MonthStepper month={month} {...nav} />

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex gap-3">
          <Stat label="Tiempo" value={formatDuration(now.minutes)} caption={`${prevName}: ${formatDuration(prev.minutes)}`} />
          <Stat
            label="Por día"
            value={now.days === 0 ? "—" : formatDuration(now.averagePerDay)}
            caption={`${prevName}: ${prev.days === 0 ? "—" : formatDuration(prev.averagePerDay)}`}
          />
        </div>
        <div className="flex gap-3">
          <Stat label="Pomodoros" value={now.pomodoros} caption={`${prevName}: ${prev.pomodoros}`} />
          <Stat label="Días con tiempo" value={now.days} caption={`${prevName}: ${prev.days}`} />
        </div>
      </Card>

      <RangeToggle value={range} />

      <SectionHeader label="Tiempo por mes" />
      <Card className="p-4">
        <ComparisonBars
          data={series.map((s) => ({ month: s.month, value: s.minutes }))}
          color={color}
          format={hours}
          label="Tiempo por mes"
          current={month}
        />
      </Card>

      <SectionHeader label={`Semanas de ${monthName(month).toLowerCase()}`} />
      <Card className="p-4">
        <WeekBars data={weeks} color={color} format={hours} label={`Tiempo por semana de ${monthName(month).toLowerCase()}`} />
      </Card>

      <SectionHeader label="Registros del mes" />
      {list.length > 0 ? (
        <Card>
          <ul className="flex flex-col">
            {list.map((e, i) => (
              <li key={`${e.date}-${i}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body text-ink">{e.topic ?? "Sin tema"}</p>
                  <p className="text-small text-muted">{dayLabel(e.date)}</p>
                </div>
                <p className="shrink-0 text-right font-mono text-small text-muted">
                  <span className="text-ink">{formatDuration(e.minutes)}</span>
                  {e.pomodoros > 0 ? (
                    <>
                      <br />
                      {e.pomodoros} {e.pomodoros === 1 ? "pomodoro" : "pomodoros"}
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <EmptyState
            title="Todavía no hay tiempo registrado este mes."
            body="Cuando registres tiempo o termines un pomodoro, lo verás aquí."
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
