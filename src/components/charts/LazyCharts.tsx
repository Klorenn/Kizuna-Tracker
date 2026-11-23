"use client";

import dynamic from "next/dynamic";

// Recharts is heavy and never visible on first paint: the charts of Resumen and the habit
// detail load through next/dynamic (client only), with a fixed-height placeholder in the
// `line` token so nothing jumps when they arrive. Server pages import these wrappers.

function Placeholder() {
  return <div aria-hidden className="h-[140px] w-full rounded-md bg-line" />;
}

export const WeeklyBarsLazy = dynamic(() => import("./WeeklyBars").then((m) => m.WeeklyBars), {
  ssr: false,
  loading: Placeholder,
});
export const MonthlyBarsLazy = dynamic(() => import("./MonthlyBars").then((m) => m.MonthlyBars), {
  ssr: false,
  loading: Placeholder,
});
export const StackedBarsLazy = dynamic(() => import("./StackedBars").then((m) => m.StackedBars), {
  ssr: false,
  loading: Placeholder,
});
