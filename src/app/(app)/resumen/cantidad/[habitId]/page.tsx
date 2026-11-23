import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { ComparisonBars } from "@/components/charts/ComparisonBars";
import { WeekBars } from "@/components/charts/WeekBars";
import { MonthStepper } from "@/components/logs/MonthStepper";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { dayLabel, monthOf, shiftMonth } from "@/domain/calendar";
import { toHabitColor } from "@/domain/habit-colors";
import { lastMonths } from "@/domain/logs";
import { formatAmount, monthlyQuantity, progressLabel, quantitySeries } from "@/domain/quantity";
import { weeklyTotals } from "@/domain/time";
import { loadQuantityData, quantityConfigOf } from "@/lib/logs-data";
import { RangeToggle } from "../../RangeToggle";
import {
  DetailHeader,
  Stat,
  compactNumber,
  dataFrom,
  loadLogsContext,
  monthName,
  parseRange,
  resolveMonth,
  stepper,
} from "../../logs-view";

export const metadata: Metadata = { title: "Cantidad" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CantidadPage({
  params,
  searchParams,
}: {
  params: Promise<{ habitId: string }>;
  searchParams: Promise<{ mes?: string | string[]; rango?: string | string[] }>;
}) {
  const { habitId } = await params;
  const { mes, rango } = await searchParams;
  if (!UUID.test(habitId)) notFound();
  const ctx = await loadLogsContext();
  const month = resolveMonth(mes, ctx.current);
  const range = parseRange(rango);
  // ownership first (from the context: the user's own habits, archived ones included because
  // their sums stay in Resumen); only then are the sums read
  const habit = ctx.logHabits.find((h) => h.id === habitId);
  const config = habit ? quantityConfigOf(habit) : null;
  if (!habit || habit.log_type !== "quantity" || !config) notFound();
  const color = toHabitColor(habit.color);
  const { entries, doneDates } = await loadQuantityData(ctx.supabase, ctx.userId, habitId, dataFrom(month, range));

  const now = monthlyQuantity(entries, doneDates, month, config);
  const prev = monthlyQuantity(entries, doneDates, shiftMonth(month, -1), config);
  const series = quantitySeries(entries, doneDates, lastMonths(month, range), config);
  // bar labels in the unit people read: glasses, or the base unit in a compact form
  const short = (n: number) =>
    config.display === "glasses" ? compactNumber(Math.round((n / config.glassMl) * 10) / 10) : compactNumber(n);
  const UNIT_NAME = { ml: "ml", steps: "pasos", km: "km", times: "veces", minutes: "min" } as const;
  const unitName =
    config.display === "glasses" ? "vasos" : config.unit === "custom" ? (config.label ?? "") : UNIT_NAME[config.unit];
  const perDay = (m: { days: number; average: number }) => (m.days === 0 ? "—" : formatAmount(m.average, config));
  const weeks = weeklyTotals(
    entries.map((e) => ({ date: e.date, value: e.amount })),
    month,
  );
  const perDayTotals = new Map<string, number>();
  for (const e of entries) {
    if (monthOf(e.date) === month) perDayTotals.set(e.date, (perDayTotals.get(e.date) ?? 0) + e.amount);
  }
  const reached = new Set(doneDates);
  const list = [...perDayTotals.entries()].sort(([a], [b]) => b.localeCompare(a));
  const nav = stepper(`/resumen/cantidad/${habitId}`, month, ctx.current, range);
  const prevName = monthName(shiftMonth(month, -1));

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <DetailHeader title={habit.name} />
      <MonthStepper month={month} {...nav} />

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex gap-3">
          <Stat label="Promedio por día" value={perDay(now)} caption={`${prevName}: ${perDay(prev)}`} />
          <Stat label="Días cumplidos" value={now.reached} caption={`${prevName}: ${prev.reached}`} />
        </div>
        <div className="flex gap-3">
          <Stat
            label="Mejor día"
            value={now.bestDay ? formatAmount(now.bestDay.total, config) : "—"}
            caption={now.bestDay ? dayLabel(now.bestDay.date) : "Sin sumas este mes"}
          />
          <Stat label="Días con sumas" value={now.days} caption={`${prevName}: ${prev.days}`} />
        </div>
      </Card>

      <RangeToggle value={range} />

      <SectionHeader label="Promedio por mes" />
      <Card className="p-4">
        <ComparisonBars
          data={series.map((s) => ({ month: s.month, value: s.average }))}
          color={color}
          format={short}
          label={`Promedio por día y por mes, en ${unitName}`}
          current={month}
        />
      </Card>

      <SectionHeader label="Días cumplidos por mes" />
      <Card className="p-4">
        <ComparisonBars
          data={series.map((s) => ({ month: s.month, value: s.reached }))}
          color={color}
          format={compactNumber}
          label="Días cumplidos por mes"
          current={month}
        />
      </Card>

      <SectionHeader label={`Semanas de ${monthName(month).toLowerCase()}`} />
      <Card className="flex flex-col gap-2 p-4">
        <WeekBars data={weeks} color={color} format={short} label={`Total por semana, en ${unitName}`} />
        <p className="text-small text-muted">Total por semana, en {unitName}.</p>
      </Card>

      <SectionHeader label="Días del mes" />
      {list.length > 0 ? (
        <Card>
          <ul className="flex flex-col">
            {list.map(([date, total]) => (
              <li key={date} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <p className="min-w-0 flex-1 text-body text-ink">{dayLabel(date)}</p>
                <p className="shrink-0 text-right font-mono text-small text-ink">{progressLabel(total, config)}</p>
                {reached.has(date) ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-small text-ink">
                    <CheckCircle size={16} weight="light" aria-hidden />
                    Meta
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <EmptyState
            title="Todavía no hay sumas este mes."
            body="Cuando sumes desde Hoy, verás aquí tus días."
          />
        </Card>
      )}
    </main>
  );
}
