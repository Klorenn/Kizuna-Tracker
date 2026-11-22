import { addDays } from "@/domain/dates";
import type { HabitColor } from "@/domain/habit-colors";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

/** Month grid, weeks Monday to Sunday. Done days are filled with the habit color, today has a ring. */
export function CompletionCalendar({
  month,
  today,
  doneDates,
  color,
}: {
  /** First day of the month, `YYYY-MM-01`. */
  month: string;
  today: string;
  doneDates: string[];
  color: HabitColor;
}) {
  const done = new Set(doneDates);
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(month, i)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="flex flex-col gap-2" data-habit-color={color}>
      <div className="section-label grid grid-cols-7 text-center text-muted" aria-hidden>
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7" role="grid" aria-label="Calendario del mes">
        {cells.map((date, i) => {
          if (!date) return <span key={i} className="h-10" />;
          const isDone = done.has(date);
          const isToday = date === today;
          const future = date > today;
          const day = Number(date.slice(8));
          return (
            <span key={date} role="gridcell" className="flex h-10 items-center justify-center">
              <span
                className={`flex size-[34px] items-center justify-center rounded-full text-small ${
                  isDone
                    ? "bg-(--habit) font-semibold text-(--habit-on)"
                    : isToday
                      ? "border-[1.5px] border-(--habit) font-semibold text-ink"
                      : future
                        ? "text-outline-strong"
                        : "text-ink"
                }`}
              >
                {day}
                {isDone ? <span className="sr-only"> hecho</span> : null}
              </span>
            </span>
          );
        })}
      </div>
      <div className="flex items-center gap-4 text-small text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-(--habit)" />
          Hecho
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full border-[1.5px] border-(--habit)" />
          Hoy
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full border border-outline-strong" />
          Sin check-in
        </span>
      </div>
    </div>
  );
}
