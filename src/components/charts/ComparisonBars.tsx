import type { MonthKey } from "@/domain/calendar";
import type { HabitColor } from "@/domain/habit-colors";

const SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const PLOT = 96; // px of bar area

/** "+40" for a positive value (deltas read as gains); zero and negatives as `format` gives them. */
export const signedLabel = (n: number, format: (n: number) => string): string =>
  n > 0 ? `+${format(n)}` : format(n);

const shortName = (m: MonthKey) => SHORT[Number(m.slice(5, 7)) - 1];

/**
 * Axis labels, one per month: all of them up to six months; beyond that every other month
 * (the last one always), each with its three-letter name so none is ambiguous. The rest stay
 * blank (the full list is in the accessible label and in each bar's tooltip).
 */
export function monthTicks(months: MonthKey[]): string[] {
  if (months.length <= 6) return months.map(shortName);
  return months.map((m, i) => ((months.length - 1 - i) % 2 === 0 ? shortName(m) : ""));
}

/**
 * One value per month, oldest first, the last (or `current`) month highlighted in the habit
 * color. `null` draws no bar (nothing to compare). Negative values hang below a baseline.
 * With more than six months the values live only in the accessible label (no room on top).
 * Plain HTML (no client JS), so `format` can be passed from a server component.
 */
export function ComparisonBars({
  data,
  color,
  format,
  label,
  current,
  signed = false,
}: {
  data: { month: MonthKey; value: number | null }[];
  color: HabitColor;
  format: (n: number) => string;
  label: string;
  /** Highlighted month; defaults to the last one. */
  current?: MonthKey;
  /** Deltas: positive values get a "+". */
  signed?: boolean;
}) {
  const fmt = signed ? (n: number) => signedLabel(n, format) : format;
  const highlight = current ?? data[data.length - 1]?.month;
  const values = data.map((d) => d.value ?? 0);
  const maxPos = Math.max(0, ...values);
  const maxNeg = Math.max(0, ...values.map((v) => -v));
  const span = maxPos + maxNeg || 1;
  const posH = maxNeg === 0 ? PLOT : Math.round((PLOT * maxPos) / span);
  const negH = PLOT - posH;
  const compact = data.length > 6;
  const ticks = monthTicks(data.map((d) => d.month));

  return (
    <div
      role="img"
      data-habit-color={color}
      aria-label={`${label}: ${data.map((d) => `${shortName(d.month)} ${d.value === null ? "sin dato" : fmt(d.value)}`).join(", ")}`}
      className="flex w-full items-end gap-1"
    >
      {data.map((d, i) => {
        const on = d.month === highlight;
        const v = d.value;
        const h = v === null || span === 0 ? 0 : Math.max(v === 0 ? 0 : 2, Math.round((Math.abs(v) / span) * PLOT));
        const bar = `w-full max-w-8 ${on ? "bg-(--habit)" : "bg-(--habit-soft) ring-1 ring-inset ring-(--habit)"}`;
        return (
          <div
            key={d.month}
            aria-hidden
            title={`${shortName(d.month)} ${d.month.slice(0, 4)}: ${v === null ? "sin dato" : fmt(v)}`}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
          >
            {compact ? null : (
              <span
                className={`h-4 max-w-full truncate font-mono text-[13px] leading-4 ${on ? "font-medium text-ink" : "text-muted"}`}
              >
                {v !== null ? fmt(v) : ""}
              </span>
            )}
            <div className="flex w-full flex-col items-center">
              <div className="flex w-full items-end justify-center" style={{ height: posH }}>
                {v !== null && v > 0 ? <div className={`${bar} rounded-t-[4px]`} style={{ height: h }} /> : null}
              </div>
              <div className="h-px w-full bg-line" />
              {negH > 0 ? (
                <div className="flex w-full items-start justify-center" style={{ height: negH }}>
                  {v !== null && v < 0 ? <div className={`${bar} rounded-b-[4px]`} style={{ height: h }} /> : null}
                </div>
              ) : null}
            </div>
            <span className={`h-4 whitespace-nowrap font-mono text-[13px] uppercase leading-4 ${on ? "text-ink" : "text-muted"}`}>
              {ticks[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
