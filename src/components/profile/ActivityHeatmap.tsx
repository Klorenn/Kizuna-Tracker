import type { activityGrid } from "@/lib/profile-view";

type Grid = ReturnType<typeof activityGrid>;

/** Rows are Monday to Sunday; only three are labeled to keep it quiet. */
const WEEKDAYS = ["L", "", "", "J", "", "", "D"];

const LEVEL = [
  "bg-ink-soft",
  "bg-accent/20",
  "bg-accent/45",
  "bg-accent/70",
  "bg-accent",
] as const;

/**
 * Perfil "Actividad": every habit together over the last weeks, one square per day. Intensity is
 * the share of your habits done that day (see activityGrid); screen readers get the totals.
 */
export function ActivityHeatmap({ grid, today }: { grid: Grid; today: string }) {
  const weeks = grid.weeks.length;
  const columns = { gridTemplateColumns: `14px repeat(${weeks}, minmax(0, 1fr))` };
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-baseline gap-1.5">
        <span className="font-mono text-[22px] font-semibold leading-none tracking-[-0.02em] text-ink">{grid.total}</span>
        <span className="text-small text-muted">
          {grid.total === 1 ? "check-in" : "check-ins"} · {grid.activeDays} {grid.activeDays === 1 ? "día activo" : "días activos"}
        </span>
      </p>

      <div
        role="img"
        aria-label={`${grid.total} check-ins en ${grid.activeDays} días de las últimas ${weeks} semanas`}
        className="flex flex-col gap-1"
      >
        <div aria-hidden className="grid gap-[3px]" style={columns}>
          <span />
          {grid.monthLabels.map((m, i) => (
            <span key={i} className="relative h-3.5 font-mono text-[11px] leading-[14px] text-muted">
              {m ? <span className="absolute left-0 whitespace-nowrap">{m}</span> : null}
            </span>
          ))}
        </div>
        <div aria-hidden className="grid gap-[3px]" style={columns}>
          <div className="grid gap-[3px]">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="flex items-center font-mono text-[11px] leading-none text-muted">
                {d}
              </span>
            ))}
          </div>
          {grid.weeks.map((col, i) => (
            <div key={i} className="grid gap-[3px]">
              {col.map((c) => (
                <span
                  key={c.date}
                  className={`aspect-square rounded-[3px] ${c.future ? "" : LEVEL[c.level]} ${
                    c.date === today ? "outline-[1.5px] outline-offset-1 outline-outline-strong" : ""
                  }`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div aria-hidden className="flex items-center justify-end gap-1.5 text-[11px] text-muted">
        <span className="mr-0.5">Menos</span>
        {LEVEL.map((cls) => (
          <span key={cls} className={`size-2.5 rounded-[2px] ${cls}`} />
        ))}
        <span className="ml-0.5">Más</span>
      </div>
    </div>
  );
}
