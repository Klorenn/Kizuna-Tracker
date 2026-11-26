"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis } from "recharts";
import type { HabitColor } from "@/domain/habit-colors";
import { EMPTY_CHART, hasChartValues } from "./empty";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function Tick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  return (
    <text x={x} y={(y ?? 0) + 14} textAnchor="middle" className="fill-muted font-mono text-[13px] uppercase">
      {payload?.value}
    </text>
  );
}

/** Check-ins per month (`YYYY-MM`), bars in the habit color with the count on top. */
export function MonthlyBars({ data, color }: { data: { month: string; count: number }[]; color: HabitColor }) {
  const rows = data.map((d) => ({ ...d, label: MONTHS[Number(d.month.slice(5, 7)) - 1] }));
  if (!hasChartValues(rows.map((r) => r.count))) {
    return <p className="py-6 text-center text-small text-muted">{EMPTY_CHART}</p>;
  }
  return (
    <div
      className="h-[140px] w-full"
      data-habit-color={color}
      role="img"
      aria-label={`Check-ins por mes: ${rows.map((r) => `${r.label} ${r.count}`).join(", ")}`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={rows} margin={{ top: 16, right: 0, bottom: 0, left: 0 }} barCategoryGap={8}>
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={<Tick />} interval={0} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} className="fill-(--habit)" isAnimationActive={false}>
            <LabelList dataKey="count" position="top" className="fill-muted font-mono text-[13px]" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
