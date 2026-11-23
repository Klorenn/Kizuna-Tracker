import { CaretRight, Drop } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { ProgressStat, progressLink } from "@/components/logs/ReadingProgress";
import { Card } from "@/components/ui/Card";
import { dayLabel, monthTitle, shiftMonth, type MonthKey } from "@/domain/calendar";
import { formatAmount, monthlyQuantity, type QuantityConfig, type QuantityEntry } from "@/domain/quantity";
import type { LocalDate } from "@/domain/types";

/**
 * Habit detail > PROGRESO for a quantity habit: the average per day and the days the goal was
 * met against the last month, and the best day. Sums are added from Hoy, so no entry link.
 */
export function QuantityProgress({
  habitId,
  month,
  config,
  entries,
  doneDates,
}: {
  habitId: string;
  month: MonthKey;
  config: QuantityConfig;
  entries: QuantityEntry[];
  doneDates: LocalDate[];
}) {
  const prevMonth = shiftMonth(month, -1);
  const prevName = monthTitle(prevMonth).name;
  const now = monthlyQuantity(entries, doneDates, month, config);
  const prev = monthlyQuantity(entries, doneDates, prevMonth, config);
  const perDay = (m: { days: number; average: number }) => (m.days === 0 ? "—" : `${formatAmount(m.average, config)}`);

  return (
    <Card>
      <div className="flex gap-3 p-4">
        <ProgressStat label="Promedio por día" value={perDay(now)} caption={`${prevName}: ${perDay(prev)}`} />
        <ProgressStat label="Días cumplidos" value={now.reached} caption={`${prevName}: ${prev.reached}`} />
      </div>
      {now.bestDay ? (
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <Drop size={20} weight="light" aria-hidden className="shrink-0 text-ink" />
          <div className="min-w-0 flex-1">
            <p className="text-small text-muted">Mejor día · {dayLabel(now.bestDay.date)}</p>
            <p className="font-mono text-body text-ink">{formatAmount(now.bestDay.total, config)}</p>
          </div>
        </div>
      ) : null}
      <Link href={`/resumen/cantidad/${habitId}`} className={progressLink}>
        <span className="flex-1">Ver por mes</span>
        <CaretRight size={18} weight="light" aria-hidden className="text-muted" />
      </Link>
    </Card>
  );
}
