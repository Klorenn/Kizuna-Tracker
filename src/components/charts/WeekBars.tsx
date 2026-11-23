import { getISOWeek } from "date-fns";
import type { HabitColor } from "@/domain/habit-colors";
import type { LocalDate } from "@/domain/types";

const PLOT = 96; // px of bar area

/**
 * One bar per Monday-start week of a month (the first and last are clipped to the month), in
 * the habit color with the value on top and "S47" under it. Plain HTML (no client JS), so
 * `format` can be passed from a server component. Zero weeks draw no bar; all zeros read as
 * an empty chart, never as NaN.
 */
export function WeekBars({
  data,
  color,
  format,
  label,
}: {
  data: { weekStart: LocalDate; value: number }[];
  color: HabitColor;
  format: (n: number) => string;
  label: string;
}) {
  const rows = data.map((d) => ({
    ...d,
    tick: `S${getISOWeek(new Date(`${d.weekStart}T12:00:00Z`))}`,
    value: Number.isFinite(d.value) ? d.value : 0,
  }));
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <div
      role="img"
      data-habit-color={color}
      aria-label={`${label}: ${rows.map((r) => `${r.tick} ${format(r.value)}`).join(", ")}`}
      className="flex w-full items-end gap-2"
    >
      {rows.map((r) => {
        const h = max === 0 || r.value === 0 ? 0 : Math.max(2, Math.round((r.value / max) * PLOT));
        return (
          <div
            key={r.weekStart}
            aria-hidden
            title={`${r.tick}: ${format(r.value)}`}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
          >
            <span className="h-4 max-w-full truncate font-mono text-[13px] leading-4 text-muted">
              {r.value > 0 ? format(r.value) : ""}
            </span>
            <div className="flex w-full items-end justify-center" style={{ height: PLOT }}>
              {h > 0 ? <div className="w-full max-w-8 rounded-t-[4px] bg-(--habit)" style={{ height: h }} /> : null}
            </div>
            <div className="h-px w-full bg-line" />
            <span className="h-4 whitespace-nowrap font-mono text-[13px] uppercase leading-4 text-muted">{r.tick}</span>
          </div>
        );
      })}
    </div>
  );
}
