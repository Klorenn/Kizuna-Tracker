"use client";

import { getISOWeek } from "date-fns";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis } from "recharts";

type Props = { data: { weekStart: string; count: number }[]; target: number };

function Tick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  return (
    <text x={x} y={(y ?? 0) + 14} textAnchor="middle" className="fill-muted font-mono text-[13px] uppercase">
      {payload?.value}
    </text>
  );
}

/** Check-ins per week. Bars under the target are grey (outline-strong), the rest accent. */
export function WeeklyBars({ data, target }: Props) {
  const rows = data.map((d) => ({
    ...d,
    label: `S${getISOWeek(new Date(`${d.weekStart}T12:00:00Z`))}`,
  }));
  return (
    <div
      className="h-[140px] w-full"
      role="img"
      aria-label={`Check-ins por semana: ${rows.map((r) => `${r.label} ${r.count}`).join(", ")}`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={rows} margin={{ top: 16, right: 0, bottom: 0, left: 0 }} barCategoryGap={8}>
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={<Tick />} interval={0} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.weekStart} className={r.count >= target ? "fill-accent" : "fill-outline-strong"} />
            ))}
            <LabelList dataKey="count" position="top" className="fill-muted font-mono text-[13px]" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
