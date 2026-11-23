import type { Metadata } from "next";
import { ComparisonBars } from "@/components/charts/ComparisonBars";
import { MonthStepper } from "@/components/logs/MonthStepper";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListRow } from "@/components/ui/ListRow";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { shiftMonth, withSearch } from "@/domain/calendar";
import {
  DAY_TYPE_LABEL,
  formatKg,
  formatSignedKg,
  gymVisits,
  groupDeltas,
  lastMonths,
  visitSeries,
  volumeSeries,
} from "@/domain/logs";
import { loadVisitDates, loadWorkoutData } from "@/lib/logs-data";
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

export const metadata: Metadata = { title: "Gimnasio" };

export default async function GimnasioPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string | string[]; rango?: string | string[] }>;
}) {
  const { mes, rango } = await searchParams;
  const ctx = await loadLogsContext();
  const month = resolveMonth(mes, ctx.current);
  const range = parseRange(rango);
  const from = dataFrom(month, range);
  const [{ exercises, sets }, visits] = await Promise.all([
    loadWorkoutData(ctx.supabase, ctx.userId, from),
    loadVisitDates(ctx.supabase, ctx.userId, from),
  ]);
  const color = colorOf(ctx.workoutHabit);
  const prevMonth = shiftMonth(month, -1);
  const prevName = monthName(prevMonth);
  const months = lastMonths(month, range);
  const volume = volumeSeries(sets, exercises, months);
  const volumeNow = volume[volume.length - 1]?.kg ?? 0;
  const volumePrev = volumeSeries(sets, exercises, [prevMonth])[0].kg;
  const groups = groupDeltas(sets, exercises, month);
  const nav = stepper("/resumen/gimnasio", month, ctx.current, range);
  const mesParam = month === ctx.current ? undefined : month;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <DetailHeader title="Gimnasio" />
      <MonthStepper month={month} {...nav} />

      <Card className="flex gap-3 p-4">
        <Stat label="Visitas" value={gymVisits(visits, month)} caption={`${prevName}: ${gymVisits(visits, prevMonth)}`} />
        <Stat label="Volumen" value={formatKg(volumeNow)} caption={`${prevName}: ${formatKg(volumePrev)}`} />
      </Card>

      <RangeToggle value={range} />

      <SectionHeader label="Visitas por mes" />
      <Card className="p-4">
        <ComparisonBars
          data={visitSeries(visits, months).map((v) => ({ month: v.month, value: v.count }))}
          color={color}
          format={compactNumber}
          label="Visitas por mes"
          current={month}
        />
      </Card>

      <SectionHeader label="Volumen por mes" action="kg" />
      <Card className="p-4">
        <ComparisonBars
          data={volume.map((v) => ({ month: v.month, value: v.kg }))}
          color={color}
          format={compactNumber}
          label="Volumen por mes en kg"
          current={month}
        />
      </Card>

      <SectionHeader label="Por grupo" action={`vs. ${prevName}`} />
      {groups.length > 0 ? (
        <Card>
          <div className="-mb-px">
            {groups.map((g) => (
              <ListRow
                key={g.group}
                href={withSearch(`/resumen/gimnasio/${g.group}`, { mes: mesParam })}
                label={DAY_TYPE_LABEL[g.group]}
                hint={`Volumen ${formatKg(g.volumeKg)}`}
                value={g.deltaKg === null ? "Sin comparación" : formatSignedKg(g.deltaKg)}
                mono={g.deltaKg !== null}
                chevron
              />
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState title="Todavía no hay entrenamientos este mes." body="Cuando registres tus series, verás aquí cómo avanzas." />
        </Card>
      )}
    </main>
  );
}
