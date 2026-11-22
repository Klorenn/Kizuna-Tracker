"use client";

import { getISOWeek } from "date-fns";
import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis } from "recharts";
import { habitColorVar, type HabitColor } from "@/domain/habit-colors";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type Row = { bucket: string; total: number } & Record<string, number | string>;
type Series = { id: string; name: string; color: HabitColor };

function Tick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  return (
    <text x={x} y={(y ?? 0) + 14} textAnchor="middle" className="fill-muted font-mono text-[13px] uppercase">
      {payload?.value}
    </text>
  );
}

/**
 * All habits at once: one stacked bar per week (`bucket` = Monday) or month (`YYYY-MM`), each
 * segment in its habit color, the total on top. Segments are split by a surface-colored hairline.
 */
export function StackedBars({ rows, series, kind }: { rows: Row[]; series: Series[]; kind: "week" | "month" }) {
  const data = rows.map((r) => ({
    ...r,
    label:
      kind === "week"
        ? `S${getISOWeek(new Date(`${r.bucket}T12:00:00Z`))}`
        : MONTHS[Number(r.bucket.slice(5, 7)) - 1],
  }));
  const what = kind === "week" ? "semana" : "mes";
  return (
    <div
      className="h-[140px] w-full"
      role="img"
      aria-label={`Check-ins por ${what}, todos los hábitos: ${data.map((r) => `${r.label} ${r.total}`).join(", ")}`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} margin={{ top: 16, right: 0, bottom: 0, left: 0 }} barCategoryGap={8}>
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={<Tick />} interval={0} />
          {series.map((s, i) => (
            <Bar
              key={s.id}
              dataKey={s.id}
              name={s.name}
              stackId="all"
              fill={habitColorVar(s.color)}
              stroke="var(--color-surface)"
              strokeWidth={1}
              isAnimationActive={false}
            >
              {i === series.length - 1 ? (
                <LabelList dataKey="total" position="top" className="fill-muted font-mono text-[13px]" />
              ) : null}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
