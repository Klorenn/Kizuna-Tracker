import Link from "next/link";
import { monthTitle } from "@/domain/calendar";
import type { HabitColor } from "@/domain/habit-colors";
import type { MonthOverview, OverviewCell } from "@/lib/calendar-days";

/** Every habit at once: a secondary (accent2) ramp; identity colors stay with each habit. */
const ALL_LEVEL = [
  "bg-line",
  "bg-[color-mix(in_oklab,var(--color-accent2)_26%,transparent)]",
  "bg-[color-mix(in_oklab,var(--color-accent2)_48%,transparent)]",
  "bg-[color-mix(in_oklab,var(--color-accent2)_72%,transparent)]",
  "bg-accent2",
];

function cellClass(c: OverviewCell, mode: "single" | "all") {
  if (!c.inMonth) return "";
  if (c.future) return "ring-1 ring-inset ring-line";
  if (mode === "single") return c.level > 0 ? "bg-(--habit)" : "bg-line";
  return ALL_LEVEL[c.level];
}

const days = (n: number) => (n === 1 ? "día" : "días");

/** "Ver por meses": one mini heatmap per month with its totals; each tile opens that month. */
export function MonthOverviewGrid({
  items,
  mode,
  color,
}: {
  items: { overview: MonthOverview; href: string; selected: boolean }[];
  mode: "single" | "all";
  color?: HabitColor;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3" data-habit-color={color}>
      {items.map(({ overview: o, href, selected }) => {
        const t = monthTitle(o.month);
        const what = mode === "all" ? "con registro" : "completados";
        const label =
          o.daysDone === 0
            ? `${t.name} ${t.year}: sin registros`
            : `${t.name} ${t.year}: ${o.daysDone} ${days(o.daysDone)} ${what}, mejor racha de ${o.bestRun} ${days(o.bestRun)}`;
        return (
          <li key={o.month}>
            <Link
              href={href}
              scroll={false}
              aria-label={label}
              aria-current={selected ? "true" : undefined}
              className={`flex h-full flex-col gap-2.5 rounded-lg border bg-surface p-3 shadow-card transition-colors duration-[120ms] hover:border-outline-strong ${
                selected ? "border-accent ring-1 ring-accent" : "border-line"
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-body font-medium text-ink">{t.name}</span>
                <span className="font-mono text-label text-muted">{t.year}</span>
              </span>
              <span aria-hidden className="grid grid-cols-7 gap-[3px]">
                {o.cells.flat().map((c) => (
                  <span key={c.date} className={`aspect-square rounded-[3px] ${cellClass(c, mode)}`} />
                ))}
              </span>
              {o.daysDone === 0 ? (
                <span className="text-small text-muted">Sin registros</span>
              ) : (
                <span className="flex flex-col text-small text-muted">
                  <span>
                    <span className="font-mono font-semibold text-ink">{o.daysDone}</span> {days(o.daysDone)}
                  </span>
                  <span>
                    Mejor racha <span className="font-mono font-semibold text-ink">{o.bestRun}</span>
                  </span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
