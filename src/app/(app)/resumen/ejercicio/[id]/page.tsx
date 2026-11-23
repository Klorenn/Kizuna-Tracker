import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProgressLine } from "@/components/charts/ProgressLine";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { dayLabel } from "@/domain/calendar";
import { DAY_TYPE_LABEL, MUSCLE_GROUPS, exerciseProgress, formatKg, type MuscleGroup } from "@/domain/logs";
import { loadWorkoutData, logWindowStart } from "@/lib/logs-data";
import { DetailHeader, Stat, colorOf, loadLogsContext } from "../../logs-view";

export const metadata: Metadata = { title: "Ejercicio" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EjercicioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await loadLogsContext();
  // only the catalog or the user's own exercises (RLS hides anyone else's; checked again here)
  const { data: exercise } = await ctx.supabase
    .from("exercises")
    .select("id,name,muscle_group,user_id")
    .eq("id", id)
    .maybeSingle();
  if (!exercise || (exercise.user_id !== null && exercise.user_id !== ctx.userId)) notFound();

  const { sets } = await loadWorkoutData(ctx.supabase, ctx.userId, logWindowStart(ctx.today));
  const progress = exerciseProgress(sets, id);
  const color = colorOf(ctx.workoutHabit);
  const group = (MUSCLE_GROUPS as readonly string[]).includes(exercise.muscle_group)
    ? (exercise.muscle_group as MuscleGroup)
    : null;
  const best = progress.reduce<{ date: string; bestKg: number } | null>(
    (b, p) => (b === null || p.bestKg > b.bestKg ? p : b),
    null,
  );
  const last = progress[progress.length - 1] ?? null;
  const lastSets = last ? sets.filter((s) => s.exerciseId === id && s.date === last.date) : [];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <DetailHeader
        title={exercise.name}
        backHref={group ? `/resumen/gimnasio/${group}` : "/resumen/gimnasio"}
        backLabel={group ? DAY_TYPE_LABEL[group] : "Gimnasio"}
      />

      {progress.length > 0 && best && last ? (
        <>
          <Card className="flex gap-3 p-4">
            <Stat label="Mejor marca" value={formatKg(best.bestKg)} caption={dayLabel(best.date)} />
            <Stat label="Última sesión" value={formatKg(last.bestKg)} caption={dayLabel(last.date)} />
          </Card>

          <SectionHeader label="Mejor peso por sesión" action="12 meses" />
          <Card className="p-4">
            <ProgressLine data={progress} color={color} label={`Mejor peso por sesión de ${exercise.name}`} />
          </Card>

          <SectionHeader label="Series de la última sesión" />
          <Card className="p-4">
            <p className="font-mono text-body text-ink">
              {lastSets.map((s) => `${s.reps} × ${formatKg(s.kg)}`).join(" · ")}
            </p>
          </Card>
        </>
      ) : (
        <Card>
          <EmptyState title="Todavía no hay series de este ejercicio." body="Cuando lo registres, verás aquí tu progreso." />
        </Card>
      )}
    </main>
  );
}
