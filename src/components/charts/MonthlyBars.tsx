"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis } from "recharts";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function Tick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  return (
    <text x={x} y={(y ?? 0) + 14} textAnchor="middle" className="fill-muted font-mono text-[13px] uppercase">
      {payload?.value}
    </text>
  );
}

/** Check-ins per month (`YYYY-MM`), accent bars with the count on top. */
export function MonthlyBars({ data }: { data: { month: string; count: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: MONTHS[Number(d.month.slice(5, 7)) - 1] }));
  return (
    <div
      className="h-[140px] w-full"
      role="img"
      aria-label={`Check-ins por mes: ${rows.map((r) => `${r.label} ${r.count}`).join(", ")}`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={rows} margin={{ top: 16, right: 0, bottom: 0, left: 0 }} barCategoryGap={8}>
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={<Tick />} interval={0} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} className="fill-accent" isAnimationActive={false}>
            <LabelList dataKey="count" position="top" className="fill-muted text-[13px]" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
