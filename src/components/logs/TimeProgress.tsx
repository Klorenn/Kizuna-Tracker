import { CaretRight, Timer } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { logEntryHref } from "@/components/logs/DayLogDetail";
import { ProgressStat, TodayEntryLink, progressLink } from "@/components/logs/ReadingProgress";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { monthTitle, shiftMonth, type MonthKey } from "@/domain/calendar";
import { formatDuration, monthlyTime, type TimeEntry } from "@/domain/time";
import type { LocalDate } from "@/domain/types";

/**
 * Habit detail > PROGRESO for a time habit: hours of the month against the last, the average
 * per day with time, pomodoros, "Medir tiempo" and the links. `entries` may hold every
 * time habit of the user: only this habit's are counted.
 */
export function TimeProgress({
  habitId,
  month,
  today,
  entries,
  todayEntry,
}: {
  habitId: string;
  month: MonthKey;
  today: LocalDate;
  entries: TimeEntry[];
  /** Today's check-in and whether it already has time; null without a check-in today. */
  todayEntry: { logged: boolean } | null;
}) {
  const prevMonth = shiftMonth(month, -1);
  const prevName = monthTitle(prevMonth).name;
  const now = monthlyTime(entries, month, habitId);
  const prev = monthlyTime(entries, prevMonth, habitId);

  return (
    <Card>
      <div className="flex gap-3 p-4">
        <ProgressStat label="Tiempo este mes" value={formatDuration(now.minutes)} caption={`${prevName}: ${formatDuration(prev.minutes)}`} />
        <ProgressStat
          label="Promedio por día"
          value={now.days === 0 ? "—" : formatDuration(now.averagePerDay)}
          caption={now.days === 0 ? "Sin días con tiempo" : `${now.days} ${now.days === 1 ? "día" : "días"} con tiempo`}
        />
      </div>
      <div className="flex items-center gap-3 border-t border-line px-4 py-3">
        <Timer size={20} weight="light" aria-hidden className="shrink-0 text-ink" />
        <p className="min-w-0 flex-1 text-body text-ink">Pomodoros este mes</p>
        <p className="shrink-0 font-mono text-small text-ink">
          {now.pomodoros}
          <span className="text-muted"> · {prevName}: {prev.pomodoros}</span>
        </p>
      </div>
      <div className="border-t border-line p-4">
        <ButtonLink href={`/habitos/${habitId}/pomodoro`}>
          <Timer size={20} weight="light" aria-hidden />
          Medir tiempo
        </ButtonLink>
      </div>
      {todayEntry ? <TodayEntryLink href={logEntryHref(habitId, "time", today)} logged={todayEntry.logged} /> : null}
      <Link href="/resumen/tiempo" className={progressLink}>
        <span className="flex-1">Ver tiempo por mes</span>
        <CaretRight size={18} weight="light" aria-hidden className="text-muted" />
      </Link>
    </Card>
  );
}
