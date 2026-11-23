import { CaretRight, PersonSimpleRun } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { logEntryHref } from "@/components/logs/DayLogDetail";
import { ProgressStat, TodayEntryLink, progressLink } from "@/components/logs/ReadingProgress";
import { Card } from "@/components/ui/Card";
import { dayLabel, monthTitle, shiftMonth, type MonthKey } from "@/domain/calendar";
import { CARDIO_KIND_LABEL, cardioSummary, formatDistance, formatPace, monthlyCardio, type CardioEntry } from "@/domain/cardio";
import type { LocalDate } from "@/domain/types";
import { cardioKind } from "@/lib/log-cards";

/**
 * Habit detail > PROGRESO for a distance habit: km of the month against the last, outings,
 * best pace (runs only) and the latest outing.
 */
export function CardioProgress({
  habitId,
  month,
  today,
  entries,
  todayEntry,
}: {
  habitId: string;
  month: MonthKey;
  today: LocalDate;
  entries: CardioEntry[];
  /** Today's check-in and whether it already has an outing; null without a check-in today. */
  todayEntry: { logged: boolean } | null;
}) {
  const prevMonth = shiftMonth(month, -1);
  const prevName = monthTitle(prevMonth).name;
  const now = monthlyCardio(entries, month);
  const prev = monthlyCardio(entries, prevMonth);
  const { kind } = cardioKind(entries);
  const last = [...entries].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;

  return (
    <Card>
      <div className="flex gap-3 p-4">
        <ProgressStat label="Distancia este mes" value={formatDistance(now.distanceM, kind)} caption={`${prevName}: ${formatDistance(prev.distanceM, kind)}`} />
        <ProgressStat label="Salidas" value={now.outings} caption={`${prevName}: ${prev.outings}`} />
      </div>
      <div className="flex items-center gap-3 border-t border-line px-4 py-3">
        <p className="min-w-0 flex-1 text-body text-ink">Mejor ritmo</p>
        <p className="shrink-0 font-mono text-small text-ink">
          {formatPace(now.bestPace)}
          <span className="text-muted"> · {prevName}: {formatPace(prev.bestPace)}</span>
        </p>
      </div>
      {last ? (
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <PersonSimpleRun size={20} weight="light" aria-hidden className="shrink-0 text-ink" />
          <div className="min-w-0 flex-1">
            <p className="text-small text-muted">Última salida · {dayLabel(last.date)}</p>
            <p className="break-words text-body text-ink">
              {CARDIO_KIND_LABEL[last.kind]} · {cardioSummary([last])}
            </p>
          </div>
        </div>
      ) : null}
      {todayEntry ? <TodayEntryLink href={logEntryHref(habitId, "cardio", today)} logged={todayEntry.logged} /> : null}
      <Link href="/resumen/distancia" className={progressLink}>
        <span className="flex-1">Ver distancia por mes</span>
        <CaretRight size={18} weight="light" aria-hidden className="text-muted" />
      </Link>
    </Card>
  );
}
