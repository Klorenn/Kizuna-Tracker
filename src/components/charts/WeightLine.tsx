"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { entryDateLabel, weightAlt } from "@/components/profile/body-view";
import type { WeightEntry } from "@/domain/body";
import type { LocalDate } from "@/domain/types";

const DAY_MS = 86_400_000;
const toDay = (d: LocalDate) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / DAY_MS;
const fromDay = (t: number): LocalDate => new Date(t * DAY_MS).toISOString().slice(0, 10);
/** Past this many points the dots would touch: the line alone reads better. */
const DOT_LIMIT = 45;

function Tick({
  x,
  y,
  payload,
  anchor,
  dy,
  format,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value: number };
  anchor: "start" | "middle" | "end";
  dy: number;
  format: (v: number) => string;
}) {
  return (
    <text x={x} y={Number(y ?? 0) + dy} textAnchor={anchor} className="fill-muted font-mono text-[13px]">
      {payload ? format(payload.value) : ""}
    </text>
  );
}

/**
 * Private weight over time (kg, 1 decimal shown). `data` is oldest first. The line is drawn in
 * the accent token; the dates sit under the first and last point and kg on the left, all mono.
 */
export function WeightLine({ data, today }: { data: WeightEntry[]; today: LocalDate }) {
  const points = data.map((e) => ({ t: toDay(e.date), kg: e.kg }));
  const kgs = points.map((p) => p.kg);
  const lo = Math.floor(Math.min(...kgs)) - 1;
  const hi = Math.ceil(Math.max(...kgs)) + 1;
  const mid = Math.round((lo + hi) / 2);
  const yTicks = [...new Set([lo, mid, hi])];
  const first = points[0]?.t ?? 0;
  const last = points[points.length - 1]?.t ?? 0;
  const xDomain: [number, number] = first === last ? [first - 1, last + 1] : [first, last];
  const xTicks = first === last ? [first] : [first, last];

  return (
    <div className="h-[200px] w-full" role="img" aria-label={weightAlt(data, today)}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis
            type="number"
            dataKey="t"
            domain={xDomain}
            ticks={xTicks}
            axisLine={false}
            tickLine={false}
            tickMargin={4}
            padding={{ left: 12, right: 12 }}
            tick={(p) => (
              <Tick
                x={p.x}
                y={p.y}
                payload={p.payload}
                anchor={p.payload?.value === first && first !== last ? "start" : p.payload?.value === last && first !== last ? "end" : "middle"}
                dy={12}
                format={(v) => entryDateLabel(fromDay(v), today)}
              />
            )}
          />
          <YAxis
            type="number"
            domain={[lo, hi]}
            ticks={yTicks}
            width={36}
            axisLine={false}
            tickLine={false}
            tick={(p) => <Tick x={p.x} y={p.y} payload={p.payload} anchor="end" dy={4} format={(v) => String(v)} />}
          />
          <Line
            type="monotone"
            dataKey="kg"
            stroke="var(--color-accent)"
            strokeWidth={2}
            dot={points.length <= DOT_LIMIT ? { r: 3, fill: "var(--color-accent)", stroke: "var(--color-surface)", strokeWidth: 1 } : false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
