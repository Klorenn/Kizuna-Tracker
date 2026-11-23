import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComparisonBars } from "@/components/charts/ComparisonBars";
import { MonthStepper } from "@/components/logs/MonthStepper";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListRow } from "@/components/ui/ListRow";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { shiftMonth } from "@/domain/calendar";
import {
  DAY_TYPE_LABEL,
  MUSCLE_GROUPS,
  formatKg,
  formatSignedKg,
  groupDeltaCopy,
  groupDeltaSeries,
  groupDeltas,
  lastMonths,
  volumeSeries,
  type MuscleGroup,
} from "@/domain/logs";
import { loadWorkoutData } from "@/lib/logs-data";
import { RangeToggle } from "../../RangeToggle";
import {
  DetailHeader,
  colorOf,
  compactNumber,
  dataFrom,
  loadLogsContext,
  monthName,
  parseRange,
  resolveMonth,
  stepper,
} from "../../logs-view";

export const metadata: Metadata = { title: "Gimnasio" };

const isGroup = (g: string): g is MuscleGroup => (MUSCLE_GROUPS as readonly string[]).includes(g);

export default async function GrupoPage({
  params,
  searchParams,
}: {
  params: Promise<{ grupo: string }>;
  searchParams: Promise<{ mes?: string | string[]; rango?: string | string[] }>;
}) {
  const { grupo } = await params;
  if (!isGroup(grupo)) notFound();
  const { mes, rango } = await searchParams;
  const ctx = await loadLogsContext();
  const month = resolveMonth(mes, ctx.current);
  const range = parseRange(rango);
  const { exercises, sets } = await loadWorkoutData(ctx.supabase, ctx.userId, dataFrom(month, range));
  const color = colorOf(ctx.workoutHabit);
  const prevName = monthName(shiftMonth(month, -1));
  const months = lastMonths(month, range);
  const group = groupDeltas(sets, exercises, month).find((g) => g.group === grupo) ?? null;
  const nav = stepper(`/resumen/gimnasio/${grupo}`, month, ctx.current, range);
  const label = DAY_TYPE_LABEL[grupo];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <DetailHeader title={label} backHref="/resumen/gimnasio" backLabel="Gimnasio" />
      <MonthStepper month={month} {...nav} />

      {group ? (
        <>
          <Card accent accentColor={color} className="flex flex-col gap-1 p-4 pl-[19px]">
            <p className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
              {groupDeltaCopy(grupo, group.deltaKg, prevName.toLowerCase())}
            </p>
            <p className="text-small text-muted">
              Volumen <span className="font-mono">{formatKg(group.volumeKg)}</span>
            </p>
          </Card>

          <SectionHeader label="Ejercicios" action={`${prevName} → ahora`} />
          <Card>
            <div className="-mb-px">
              {group.exercises.map((e) => (
                <ListRow
                  key={e.exerciseId}
                  href={`/resumen/ejercicio/${e.exerciseId}`}
                  label={e.name}
                  hint={
                    <span className="font-mono">
                      {e.previousKg === null ? "" : `${formatKg(e.previousKg)} → `}
                      {formatKg(e.currentKg)}
                    </span>
                  }
                  value={e.deltaKg === null ? "Nuevo" : formatSignedKg(e.deltaKg)}
                  mono={e.deltaKg !== null}
                  chevron
                />
              ))}
            </div>
          </Card>
        </>
      ) : (
        <Card>
          <EmptyState title={`Sin ejercicios de ${label.toLowerCase()} este mes.`} body="Elige otro mes o registra un entrenamiento." />
        </Card>
      )}

      <RangeToggle value={range} />

      <SectionHeader label="Cambio por mes" action="kg" />
      <Card className="p-4">
        <ComparisonBars
          data={groupDeltaSeries(sets, exercises, grupo, months).map((d) => ({ month: d.month, value: d.deltaKg }))}
          color={color}
          format={compactNumber}
          signed
          label={`Cambio de kg en ${label.toLowerCase()} por mes`}
          current={month}
        />
      </Card>

      <SectionHeader label="Volumen por mes" action="kg" />
      <Card className="p-4">
        <ComparisonBars
          data={volumeSeries(sets, exercises, months, grupo).map((d) => ({ month: d.month, value: d.kg }))}
          color={color}
          format={compactNumber}
          label={`Volumen de ${label.toLowerCase()} por mes en kg`}
          current={month}
        />
      </Card>
    </main>
  );
}
