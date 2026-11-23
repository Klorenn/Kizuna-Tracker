import { dayLabel } from "@/domain/calendar";
import type { HabitColor } from "@/domain/habit-colors";
import { formatKg } from "@/domain/logs";
import type { LocalDate } from "@/domain/types";

const W = 320;
const H = 140;
const PAD = { top: 8, right: 8, bottom: 8, left: 8 };

const shortDate = (d: LocalDate) => {
  const [day, , month] = dayLabel(d).split(" ");
  return `${day} ${month.slice(0, 3)}`;
};

/** One point of the line: `bestKg` (weights) or `value` (any other measure, e.g. seconds per km). */
type Point = { date: LocalDate; bestKg?: number; value?: number };
const valueOf = (p: Point) => p.value ?? p.bestKg ?? 0;

/**
 * Best kg per session of one exercise, oldest first: a line in the habit color with a dot per
 * session, the highest and lowest weights on top, first and last dates below. Plain SVG, no client JS.
 *
 * Other measures pass `value` points and a `format`. With `lowerIsBetter` (pace: fewer seconds
 * per km is faster) the axis flips so an improvement always climbs, and the labels read
 * "Mejor" (the lowest value) and "Más lento" (the highest).
 */
export function ProgressLine({
  data,
  color,
  label,
  format = formatKg,
  lowerIsBetter = false,
}: {
  data: Point[];
  color: HabitColor;
  label: string;
  format?: (n: number) => string;
  lowerIsBetter?: boolean;
}) {
  const values = data.map(valueOf).filter((v) => Number.isFinite(v));
  if (data.length === 0 || values.length !== data.length) {
    return <p className="text-small text-muted">Todavía no hay datos para el gráfico.</p>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length === 1 ? innerW / 2 : (innerW * i) / (data.length - 1));
  const y = (v: number) => {
    if (max === min) return PAD.top + innerH / 2;
    const up = lowerIsBetter ? (max - v) / range : (v - min) / range;
    return PAD.top + innerH - up * innerH;
  };
  const points = data.map((d, i) => `${x(i).toFixed(1)},${y(valueOf(d)).toFixed(1)}`).join(" ");
  const top = lowerIsBetter ? `Mejor ${format(min)}` : `Máx. ${format(max)}`;
  const bottom = lowerIsBetter ? `Más lento ${format(max)}` : `Mín. ${format(min)}`;

  return (
    <figure
      role="img"
      data-habit-color={color}
      aria-label={`${label}: ${data.map((d) => `${dayLabel(d.date)} ${format(valueOf(d))}`).join(", ")}`}
      className="flex flex-col gap-1"
    >
      <div aria-hidden className="flex justify-between font-mono text-[13px] text-muted">
        <span>{top}</span>
        {max !== min ? <span>{bottom}</span> : null}
      </div>
      <svg aria-hidden viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible">
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className="stroke-line" strokeWidth={1} />
        {data.length > 1 ? (
          <polyline points={points} fill="none" className="stroke-(--habit)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        {data.map((d, i) => (
          <circle
            key={`${d.date}-${i}`}
            cx={x(i)}
            cy={y(valueOf(d))}
            r={i === data.length - 1 ? 4.5 : 3.5}
            className={i === data.length - 1 ? "fill-(--habit) stroke-surface" : "fill-surface stroke-(--habit)"}
            strokeWidth={2}
          />
        ))}
      </svg>
      <div aria-hidden className={`flex font-mono text-[13px] text-muted ${data.length > 1 ? "justify-between" : "justify-center"}`}>
        <span>{shortDate(data[0].date)}</span>
        {data.length > 1 ? <span>{shortDate(data[data.length - 1].date)}</span> : null}
      </div>
    </figure>
  );
}
