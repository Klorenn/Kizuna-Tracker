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

/**
 * Best kg per session of one exercise, oldest first: a line in the habit color with a dot per
 * session, the highest and lowest weights on top, first and last dates below. Plain SVG, no client JS.
 */
export function ProgressLine({
  data,
  color,
  label,
}: {
  data: { date: LocalDate; bestKg: number }[];
  color: HabitColor;
  label: string;
}) {
  const min = Math.min(...data.map((d) => d.bestKg));
  const max = Math.max(...data.map((d) => d.bestKg));
  const range = max - min || 1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length === 1 ? innerW / 2 : (innerW * i) / (data.length - 1));
  const y = (kg: number) => PAD.top + (max === min ? innerH / 2 : innerH - ((kg - min) / range) * innerH);
  const points = data.map((d, i) => `${x(i).toFixed(1)},${y(d.bestKg).toFixed(1)}`).join(" ");

  return (
    <figure
      role="img"
      data-habit-color={color}
      aria-label={`${label}: ${data.map((d) => `${dayLabel(d.date)} ${formatKg(d.bestKg)}`).join(", ")}`}
      className="flex flex-col gap-1"
    >
      <div aria-hidden className="flex justify-between font-mono text-[13px] text-muted">
        <span>Máx. {formatKg(max)}</span>
        {max !== min ? <span>Mín. {formatKg(min)}</span> : null}
      </div>
      <svg aria-hidden viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible">
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className="stroke-line" strokeWidth={1} />
        {data.length > 1 ? (
          <polyline points={points} fill="none" className="stroke-(--habit)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        {data.map((d, i) => (
          <circle
            key={d.date}
            cx={x(i)}
            cy={y(d.bestKg)}
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
