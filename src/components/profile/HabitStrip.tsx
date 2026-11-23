import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { HabitColor } from "@/domain/habit-colors";
import { streakText } from "@/lib/profile-view";

export type HabitStripItem = {
  id: string;
  name: string;
  color: HabitColor;
  streak: { value: number; unit: "days" | "weeks" };
  /** Last 7 days, oldest first. */
  week: { date: string; done: boolean }[];
};

/** Tiny 7-day sparkline in the habit's identity color (soft = not done). */
function WeekDots({ week }: { week: HabitStripItem["week"] }) {
  const done = week.filter((d) => d.done).length;
  return (
    <span role="img" aria-label={`${done} de los últimos 7 días`} className="flex shrink-0 items-center gap-[3px]">
      {week.map((d) => (
        <span key={d.date} className={`size-2 rounded-full ${d.done ? "bg-(--habit)" : "bg-(--habit-soft)"}`} />
      ))}
    </span>
  );
}

/** "Tus hábitos": one row per active habit with its color, streak and last week. */
export function HabitStrip({ habits }: { habits: HabitStripItem[] }) {
  return (
    <ul className="divide-y divide-line">
      {habits.map((h) => (
        <li key={h.id} data-habit-color={h.color}>
          <Link
            href={`/habitos/${h.id}`}
            className="flex min-h-[60px] items-center gap-3 px-4 py-2.5 transition-colors duration-[120ms] hover:bg-field focus-visible:outline-offset-[-2px]"
          >
            <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-(--habit)" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-body text-ink">{h.name}</span>
              <span className="text-small text-muted">
                {h.streak.value > 0 ? (
                  <>
                    <span className="font-mono font-medium text-ink">{h.streak.value}</span> {streakText(h.streak.value, h.streak.unit)} de racha
                  </>
                ) : (
                  "Sin racha activa"
                )}
              </span>
            </span>
            <WeekDots week={h.week} />
            <CaretRight size={18} weight="light" aria-hidden className="-mr-1 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
