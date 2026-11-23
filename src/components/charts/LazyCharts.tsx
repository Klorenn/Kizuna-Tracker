"use client";

import dynamic from "next/dynamic";

// Recharts is heavy and never visible on first paint: the charts of Resumen and the habit
// detail load through next/dynamic (client only), with a fixed-height placeholder in the
// `line` token so nothing jumps when they arrive. The placeholder is an image with the name
// of the chart, so it has an accessible name before the chart hydrates.
// Server pages import these wrappers.

function placeholder(label: string) {
  return function Placeholder() {
    return <div role="img" aria-label={label} className="h-[140px] w-full rounded-md bg-line" />;
  };
}

export const WeeklyBarsLazy = dynamic(() => import("./WeeklyBars").then((m) => m.WeeklyBars), {
  ssr: false,
  loading: placeholder("Check-ins por semana (cargando)"),
});
export const MonthlyBarsLazy = dynamic(() => import("./MonthlyBars").then((m) => m.MonthlyBars), {
  ssr: false,
  loading: placeholder("Check-ins por mes (cargando)"),
});
export const StackedBarsLazy = dynamic(() => import("./StackedBars").then((m) => m.StackedBars), {
  ssr: false,
  loading: placeholder("Check-ins por hábito (cargando)"),
});
