import { Barbell, CaretRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { logEntryHref } from "@/components/logs/DayLogDetail";
import { ProgressStat, TodayEntryLink, progressLink } from "@/components/logs/ReadingProgress";
import { Card } from "@/components/ui/Card";
import { dayLabel, monthTitle, shiftMonth, type MonthKey } from "@/domain/calendar";
import {
  formatKg,
  gymVisits,
  logSubtitle,
  type ExerciseRef,
  type WorkoutDraft,
  type WorkoutSet,
} from "@/domain/logs";
import type { LocalDate } from "@/domain/types";

/** The `n` exercises trained on the most sessions (ties: heavier first), with their best kg. */
export function topExercises(
  sets: WorkoutSet[],
  exercises: ExerciseRef[],
  n: number,
): { id: string; name: string; sessions: number; bestKg: number }[] {
  const names = new Map(exercises.map((e) => [e.id, e.name]));
  const stats = new Map<string, { sessions: Set<string>; bestKg: number }>();
  for (const s of sets) {
    const st = stats.get(s.exerciseId) ?? { sessions: new Set<string>(), bestKg: 0 };
    st.sessions.add(s.sessionId);
    st.bestKg = Math.max(st.bestKg, s.kg);
    stats.set(s.exerciseId, st);
  }
  return [...stats.entries()]
    .map(([id, st]) => ({ id, name: names.get(id) ?? "Ejercicio", sessions: st.sessions.size, bestKg: st.bestKg }))
    .sort((a, b) => b.sessions - a.sessions || b.bestKg - a.bestKg || a.name.localeCompare(b.name, "es"))
    .slice(0, n);
}

/** Habit detail > PROGRESO for a workout habit: visits, last workout, top exercises, links. */
export function WorkoutProgress({
  habitId,
  month,
  today,
  exercises,
  sets,
  sessions,
  visits,
  todayEntry,
}: {
  habitId: string;
  month: MonthKey;
  today: LocalDate;
  exercises: ExerciseRef[];
  sets: WorkoutSet[];
  sessions: ({ date: LocalDate } & WorkoutDraft)[];
  visits: LocalDate[];
  todayEntry: { logged: boolean } | null;
}) {
  const prevMonth = shiftMonth(month, -1);
  const prevName = monthTitle(prevMonth).name;
  const last = [...sessions].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const top = topExercises(sets, exercises, 3);

  return (
    <Card>
      <div className="flex gap-3 p-4">
        <ProgressStat label="Visitas este mes" value={gymVisits(visits, month)} caption={`${prevName}: ${gymVisits(visits, prevMonth)}`} />
      </div>
      {last ? (
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <Barbell size={20} weight="light" aria-hidden className="shrink-0 text-ink" />
          <div className="min-w-0 flex-1">
            <p className="text-small text-muted">Último entrenamiento · {dayLabel(last.date)}</p>
            <p className="truncate text-body text-ink">
              {logSubtitle({ kind: "workout", dayTypes: last.dayTypes, exerciseCount: last.exercises.length })}
            </p>
          </div>
        </div>
      ) : null}
      {top.length > 0 ? (
        <ul aria-label="Ejercicios más usados">
          {top.map((e) => (
            <li key={e.id}>
              <Link href={`/resumen/ejercicio/${e.id}`} className={progressLink}>
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="shrink-0 font-mono text-small text-muted">Mejor {formatKg(e.bestKg)}</span>
                <CaretRight size={18} weight="light" aria-hidden className="shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {todayEntry ? (
        <TodayEntryLink href={logEntryHref(habitId, "workout", today)} logged={todayEntry.logged} />
      ) : null}
      <Link href="/resumen/gimnasio" className={progressLink}>
        <span className="flex-1">Ver gimnasio por mes</span>
        <CaretRight size={18} weight="light" aria-hidden className="text-muted" />
      </Link>
    </Card>
  );
}
