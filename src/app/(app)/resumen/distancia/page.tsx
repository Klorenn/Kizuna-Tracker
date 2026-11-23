import type { Metadata } from "next";
import Link from "next/link";
import { ComparisonBars } from "@/components/charts/ComparisonBars";
import { ProgressLine } from "@/components/charts/ProgressLine";
import { WeekBars } from "@/components/charts/WeekBars";
import { MonthStepper } from "@/components/logs/MonthStepper";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { dayLabel, monthOf, shiftMonth } from "@/domain/calendar";
import {
  CARDIO_KIND_LABEL,
  cardioSeries,
  cardioSummary,
  formatDistance,
  formatPace,
  monthlyCardio,
  paceTrend,
} from "@/domain/cardio";
import { toHabitColor } from "@/domain/habit-colors";
import { lastMonths } from "@/domain/logs";
import { weeklyTotals } from "@/domain/time";
import { cardioKind } from "@/lib/log-cards";
import { loadCardioData } from "@/lib/logs-data";
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

export const metadata: Metadata = { title: "Distancia" };

export default async function DistanciaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string | string[]; rango?: string | string[] }>;
}) {
  const { mes, rango } = await searchParams;
  const ctx = await loadLogsContext();
  const month = resolveMonth(mes, ctx.current);
  const range = parseRange(rango);
  const [entries, { data: habitRows }] = await Promise.all([
    loadCardioData(ctx.supabase, ctx.userId, dataFrom(month, range)),
    ctx.supabase
      .from("habits")
      .select("id,color")
      .eq("user_id", ctx.userId)
      .eq("log_type", "cardio")
      .order("created_at")
      .order("id"),
  ]);
  const habit = habitRows?.[0] ? { id: habitRows[0].id, color: toHabitColor(habitRows[0].color) } : null;
  const color = colorOf(habit);
  const { kind, label } = cardioKind(entries);

  const now = monthlyCardio(entries, month);
  const prev = monthlyCardio(entries, shiftMonth(month, -1));
  const series = cardioSeries(entries, lastMonths(month, range));
  // bar labels in the unit people read: km with one decimal (metres for a swim)
  const dist = (m: number) => (kind === "swim" ? compactNumber(m) : compactNumber(Math.round(m / 100) / 10));
  const unit = kind === "swim" ? "m" : "km";
  const weeks = weeklyTotals(
    entries.map((e) => ({ date: e.date, value: e.distanceM })),
    month,
  );
  const pace = paceTrend(entries);
  const list = entries
    .filter((e) => monthOf(e.date) === month)
    .sort((a, b) => b.date.localeCompare(a.date));
  const nav = stepper("/resumen/distancia", month, ctx.current, range);
  const prevName = monthName(shiftMonth(month, -1));

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <DetailHeader title={label} />
      <MonthStepper month={month} {...nav} />

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex gap-3">
          <Stat label="Distancia" value={formatDistance(now.distanceM, kind)} caption={`${prevName}: ${formatDistance(prev.distanceM, kind)}`} />
          <Stat label="Salidas" value={now.outings} caption={`${prevName}: ${prev.outings}`} />
        </div>
        <div className="flex gap-3">
          <Stat label="Mejor ritmo" value={formatPace(now.bestPace)} caption={`${prevName}: ${formatPace(prev.bestPace)}`} />
          <Stat
            label="Salida más larga"
            value={now.longestM > 0 ? formatDistance(now.longestM, kind) : "—"}
            caption={`${prevName}: ${prev.longestM > 0 ? formatDistance(prev.longestM, kind) : "—"}`}
          />
        </div>
      </Card>

      <RangeToggle value={range} />

      <SectionHeader label={`Distancia por mes (${unit})`} />
      <Card className="p-4">
        <ComparisonBars
          data={series.map((s) => ({ month: s.month, value: s.distanceM }))}
          color={color}
          format={dist}
          label={`Distancia por mes, en ${unit}`}
          current={month}
        />
      </Card>

      <SectionHeader label={`Semanas de ${monthName(month).toLowerCase()} (${unit})`} />
      <Card className="p-4">
        <WeekBars data={weeks} color={color} format={dist} label={`Distancia por semana, en ${unit}`} />
      </Card>

      <SectionHeader label="Ritmo por salida" />
      <Card className="flex flex-col gap-2 p-4">
        {pace.length > 0 ? (
          <>
            <ProgressLine
              data={pace.map((p) => ({ date: p.date, value: p.pace }))}
              color={color}
              label="Ritmo por salida"
              format={formatPace}
              lowerIsBetter
            />
            <p className="text-small text-muted">Solo trotes de 1 km o más. Más arriba es más rápido.</p>
          </>
        ) : (
          <p className="text-small text-muted">El ritmo aparece cuando registras un trote de 1 km o más.</p>
        )}
      </Card>

      <SectionHeader label="Salidas del mes" />
      {list.length > 0 ? (
        <Card>
          <ul className="flex flex-col">
            {list.map((e) => (
              <li key={e.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="text-body text-ink">{CARDIO_KIND_LABEL[e.kind]}</p>
                  <p className="text-small text-muted">{dayLabel(e.date)}</p>
                </div>
                <p className="shrink-0 text-right font-mono text-small text-ink">{cardioSummary([e])}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <EmptyState
            title="Todavía no hay salidas este mes."
            body="Cuando registres cuánto avanzaste, lo verás aquí."
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
