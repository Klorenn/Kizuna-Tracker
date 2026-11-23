import { addDays } from "@/domain/dates";
import type { HabitColor } from "@/domain/habit-colors";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const MAX_DOTS = 4;

type Habit = { id: string; name: string; color: HabitColor };

/**
 * Month grid for every habit at once: under each day, one dot per habit done that day, in its
 * color (up to four, then a hollow dot for "more"). Screen readers get the habit names.
 */
export function MultiHabitCalendar({
  month,
  today,
  habits,
  doneByDay,
}: {
  /** First day of the month, `YYYY-MM-01`. */
  month: string;
  today: string;
  habits: Habit[];
  /** Habit ids done on each date (see completionsByDay). */
  doneByDay: Record<string, string[]>;
}) {
  const byId = new Map(habits.map((h) => [h.id, h]));
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(month, i)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="section-label grid grid-cols-7 text-center text-muted" aria-hidden>
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7" role="grid" aria-label="Calendario del mes, todos los hábitos">
        {cells.map((date, i) => {
          if (!date) return <span key={i} className="h-12" />;
          const done = (doneByDay[date] ?? []).flatMap((id) => {
            const h = byId.get(id);
            return h ? [h] : [];
          });
          const isToday = date === today;
          const future = date > today;
          const shown = done.length > MAX_DOTS ? done.slice(0, MAX_DOTS - 1) : done;
          return (
            <span key={date} role="gridcell" className="flex h-12 flex-col items-center justify-center gap-[3px]">
              <span
                className={`flex size-[26px] items-center justify-center rounded-full text-small ${
                  isToday ? "border-[1.5px] border-accent font-semibold text-ink" : future ? "text-outline-strong" : "text-ink"
                } ${done.length > 0 ? "font-semibold" : ""}`}
              >
                {Number(date.slice(8))}
              </span>
              <span aria-hidden className="flex h-[6px] items-center gap-[2px]">
                {shown.map((h) => (
                  <span key={h.id} data-habit-color={h.color} className="size-[6px] rounded-full bg-(--habit)" />
                ))}
                {done.length > MAX_DOTS ? (
                  <span className="size-[6px] rounded-full border border-outline-strong" />
                ) : null}
              </span>
              {done.length > 0 ? <span className="sr-only">hecho: {done.map((h) => h.name).join(", ")}</span> : null}
            </span>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-small text-muted" aria-label="Colores de tus hábitos">
        {habits.map((h) => (
          <li key={h.id} className="flex items-center gap-1.5">
            <span aria-hidden data-habit-color={h.color} className="size-2.5 rounded-full bg-(--habit)" />
            {h.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
